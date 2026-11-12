import mongoose from "mongoose";
import User from "../models/users.js";
import AccountLifecycleLock from "../models/accountLifecycleLock.js";
import { runAccountLifecycle } from "./accountLifecycle.js";
import { AccountLifecycleConflictError } from "../utils/errors.js";

let cursor;

// Advance through account ids so a failing account cannot monopolize every batch.
export const recoverPendingAccountLifecycles = async ({ batchSize = 20 } = {}) => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Lifecycle recovery batch size must be an integer between 1 and 1000");
  }
  const pending = { lifecycleAction: { $in: ["delete", "soft-delete", "restore"] } };
  let users = await User.find({ ...pending, ...(cursor ? { _id: { $gt: cursor } } : {}) })
    .select("_id +lifecycleAction").sort({ _id: 1 }).limit(batchSize).lean();
  if (!users.length && cursor) {
    cursor = undefined;
    users = await User.find(pending).select("_id +lifecycleAction").sort({ _id: 1 }).limit(batchSize).lean();
  }

  const counts = { processed: 0, recovered: 0, blocked: 0 };
  for (const user of users) {
    cursor = user._id;
    counts.processed++;
    try {
      // The coordinator resumes the persisted intent before this callback runs.
      const response = await runAccountLifecycle(user._id, user.lifecycleAction,
        async () => ({ success: true }));
      if (response.success) counts.recovered++;
    } catch (error) {
      if (error instanceof AccountLifecycleConflictError) counts.blocked++;
      else console.error("Account lifecycle recovery failed:", user._id.toString(), error.name);
    }
  }
  return counts;
};

// This assertion must follow deployment fencing and verification of DB writes.
// Elapsed time and a dead process alone cannot establish that a write has stopped.
export const recoverLifecycleLock = async (id, token, { writersStopped = false } = {}) => {
  if (writersStopped !== true) throw new Error("Confirm that the previous writers and database operations have stopped before recovering a lock");
  if (!mongoose.isObjectIdOrHexString(id) || typeof token !== "string" || !token) {
    throw new Error("A valid account id and exact lock token are required");
  }
  const removed = await AccountLifecycleLock.deleteOne({ _id: id, token });
  return removed.deletedCount === 1;
};
