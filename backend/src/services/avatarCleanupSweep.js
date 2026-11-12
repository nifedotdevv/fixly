import { randomUUID } from "node:crypto";
import User from "../models/users.js";
import { cleanupAvatarImages } from "./avatarImages.js";
import { isCloudinaryConfigured } from "../config/cloudinary.js";
import { positiveInteger } from "../config/backgroundJobs.js";
import { startBackgroundTask } from "./backgroundTask.js";

export const runAvatarCleanupSweep = async () => {
  if (!isCloudinaryConfigured()) return { processed: 0, cleaned: 0 };
  const batchSize = positiveInteger("AVATAR_CLEANUP_BATCH_SIZE", 20, 1000);
  const retryMs = positiveInteger("AVATAR_CLEANUP_RETRY_MS", 300_000, 86_400_000);
  const claimMs = positiveInteger("AVATAR_CLEANUP_CLAIM_MS", 60_000, 3_600_000);
  let processed = 0;
  let cleaned = 0;
  // A failed account is delayed so it cannot monopolize subsequent batches.
  for (let index = 0; index < batchSize; index++) {
    const token = randomUUID();
    const user = await User.findOneAndUpdate({
      "avatarCleanup.0": { $exists: true },
      $expr: { $and: [
        { $lte: [{ $ifNull: ["$avatarCleanupClaimUntil", new Date(0)] }, "$$NOW"] },
        { $lte: [{ $ifNull: ["$avatarCleanupNextAttemptAt", new Date(0)] }, "$$NOW"] },
      ] },
    }, [{ $set: {
      avatarCleanupClaim: token,
      avatarCleanupClaimUntil: { $add: ["$$NOW", claimMs] },
      avatarCleanupNextAttemptAt: { $add: ["$$NOW", retryMs] },
    } }], {
      updatePipeline: true, returnDocument: "after",
      sort: { avatarCleanupNextAttemptAt: 1, _id: 1 },
    }).select("_id");
    if (!user) break;
    processed++;
    try {
      if (await cleanupAvatarImages(user._id)) cleaned++;
    } finally {
      // A late worker must never release a newer worker's claim.
      await User.updateOne({ _id: user._id, avatarCleanupClaim: token }, {
        $set: { avatarCleanupClaim: null, avatarCleanupClaimUntil: null },
      });
    }
  }
  return { processed, cleaned };
};

export const startAvatarCleanupSweep = () => {
  if (process.env.NODE_ENV === "test" || !isCloudinaryConfigured()) return { stop: async () => {} };
  positiveInteger("AVATAR_CLEANUP_BATCH_SIZE", 20, 1000);
  positiveInteger("AVATAR_CLEANUP_RETRY_MS", 300_000, 86_400_000);
  positiveInteger("AVATAR_CLEANUP_CLAIM_MS", 60_000, 3_600_000);
  return startBackgroundTask(runAvatarCleanupSweep,
    positiveInteger("AVATAR_CLEANUP_INTERVAL_MS", 300_000, 86_400_000), { runImmediately: true });
};
