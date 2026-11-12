import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import AccountLifecycleLock from "../models/accountLifecycleLock.js";
import User from "../models/users.js";
import Profile from "../models/artisanProfile.js";
import { cleanupAvatarImages } from "./avatarImages.js";
import { assertNoBookingObligations } from "./requests/rules.js";
import { AccountLifecycleConflictError, isDuplicateKey } from "../utils/errors.js";

const result = (statusCode, message, id) => ({
  statusCode,
  success: statusCode < 400,
  message,
  ...(id === undefined ? {} : { data: { id } }),
});

// Locks deliberately do not expire: a paused writer can outlive any lease.
// Callers must read account invariants only after acquiring this shared lock.
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
    const recovered = await resumePendingAccountLifecycle(id);
    if (recovered && (!recovered.response.success || (action === "delete" && recovered.action === "delete"))) {
      return recovered.response;
    }
    return await operation();
  } catch (error) {
    operationError = error;
    // A lost acknowledgement cannot establish whether a dispatched write finished.
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

// Fixed ordering prevents cyclic acquisition; contention returns promptly with 409.
export const runAccountLifecycles = (ids, action, operation) => {
  const ordered = [...new Set(ids.map((id) => id.toString()))].sort();
  const acquire = (index) => index === ordered.length
    ? operation()
    : runAccountLifecycle(ordered[index], action, () => acquire(index + 1));
  return acquire(0);
};

// All helpers below require the caller to hold the account lifecycle lock.
export const setAccountDeletionState = async (id, isDeleted, {
  deletionReason = "admin", invalidateSessions = isDeleted,
} = {}) => {
  const user = await User.findById(id).select("+deletionReason");
  if (!user) return result(404, "User not found");
  if (isDeleted) await assertNoBookingObligations(id);

  const action = isDeleted ? "soft-delete" : "restore";
  const state = { isDeleted, deletedAt: isDeleted ? (user.deletedAt || new Date()) : null };
  const updated = await User.updateOne({ _id: id }, {
    $set: {
      ...state,
      lifecycleAction: action,
      deletionReason: isDeleted
        ? (deletionReason === "admin" ? "admin" : (user.isDeleted ? (user.deletionReason || "admin") : "self"))
        : null,
    },
    $inc: { avatarVersion: 1, ...(invalidateSessions ? { authVersion: 1 } : {}) },
  });
  if (!updated.matchedCount) return result(404, "User not found");
  await Profile.updateOne({ user_id: id }, { $set: state });
  await User.updateOne({ _id: id, lifecycleAction: action }, { $set: { lifecycleAction: null } });
  return result(200, isDeleted ? "User soft-deleted successfully" : "User restored successfully", id);
};

export const hardDeleteAccount = async (id) => {
  await assertNoBookingObligations(id);
  const existing = await User.findById(id);
  const account = await User.findOneAndUpdate({ _id: id }, {
    $set: { isDeleted: true, deletedAt: existing?.deletedAt || new Date(), lifecycleAction: "delete" },
    $inc: { avatarVersion: 1 },
  }, { returnDocument: "after" }).select("+avatar.publicId");

  if (account?.avatar?.publicId) {
    await User.updateOne({ _id: id }, {
      $set: { avatar: null },
      $addToSet: { avatarCleanup: account.avatar.publicId },
    });
  }
  if (account && !await cleanupAvatarImages(id)) {
    return result(503, "Account deactivated; image cleanup is pending. Retry deletion to finish.");
  }

  // Preserve the user and its durable intent until dependent records are removed.
  const profile = await Profile.deleteOne({ user_id: id });
  const user = await User.deleteOne({ _id: id });
  if (!user.deletedCount && !profile.deletedCount) return result(404, "User not found");
  return result(200, "User deleted successfully", id);
};

export const resumePendingAccountLifecycle = async (id) => {
  const user = await User.findById(id).select("+lifecycleAction");
  if (!user?.lifecycleAction) return null;
  if (user.lifecycleAction === "delete") {
    const response = await hardDeleteAccount(id);
    return { action: "delete", response };
  }

  const state = {
    isDeleted: user.lifecycleAction === "soft-delete",
    deletedAt: user.lifecycleAction === "soft-delete" ? user.deletedAt : null,
  };
  await Profile.updateOne({ user_id: id }, { $set: state });
  await User.updateOne({ _id: id, lifecycleAction: user.lifecycleAction }, { $set: { lifecycleAction: null } });
  return { action: user.lifecycleAction, response: result(200, "Account lifecycle recovered successfully", id) };
};
