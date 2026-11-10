import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import AccountLifecycleLock from "../models/accountLifecycleLock.js";
import { AccountLifecycleConflictError, isDuplicateKey } from "../utils/errors.js";

// Creation, role changes, deletion, and restoration share this account-scoped lock.
// Callers must read invariant-related account/profile state only after acquiring it.
export const runAccountLifecycle = async (id, action, operation) => {
  const token = randomUUID();
  try {
    await AccountLifecycleLock.create({
      _id: id, token, action, host: hostname(), processId: process.pid,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AccountLifecycleConflictError();
    throw error;
  }

  let operationError;
  let retainLock = false;
  try {
    return await operation();
  } catch (error) {
    operationError = error;
    // A driver error can leave the outcome of a dispatched write unknown.
    // Do not admit a new writer until an operator verifies the old one stopped.
    retainLock = error?.name?.startsWith("Mongo") || error?.name === "MongooseServerSelectionError";
    if (retainLock) console.error("Account lifecycle lock requires recovery:", id.toString());
    throw error;
  } finally {
    if (!retainLock) {
      try {
        await AccountLifecycleLock.deleteOne({ _id: id, token });
      } catch (error) {
        console.error("Account lifecycle lock requires recovery:", id.toString());
        if (!operationError) throw error;
      }
    }
  }
};

// Fixed ordering prevents cyclic acquisition; contention fails promptly with the existing 409.
export const runAccountLifecycles = (ids, action, operation) => {
  const ordered = [...new Set(ids.map((id) => id.toString()))].sort();
  const acquire = (index) => index === ordered.length
    ? operation()
    : runAccountLifecycle(ordered[index], action, () => acquire(index + 1));
  return acquire(0);
};
