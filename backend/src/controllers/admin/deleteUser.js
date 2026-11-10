import mongoose from "mongoose";
import User from "../../models/users.js";
import Profile from "../../models/artisanProfile.js";
import { handleMongooseError } from "../../utils/errors.js";
import { cleanupAvatarImages } from "../../services/avatarImages.js";
import { runAccountLifecycle } from "../../services/accountLifecycle.js";
import { assertNoBookingObligations } from "../../services/requests/rules.js";

const result = (statusCode, message, data) => ({
  statusCode,
  success: statusCode < 400,
  message,
  ...(data === undefined ? {} : { data }),
});
const notFound = () => result(404, "User not found");

// Every lifecycle endpoint uses the same account lock and response handling.
const lifecycle = (action, operation) => async (req, res) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(result(400, "You must provide a valid id parameter"));
  }
  try {
    const response = await runAccountLifecycle(id, action, () => operation(id));
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return handleMongooseError(res, error);
  }
};

export const deleteUser = lifecycle("delete", async (id) => {
  await assertNoBookingObligations(id);
  const account = await User.findOneAndUpdate({ _id: id }, {
    $set: { isDeleted: true, deletedAt: new Date() },
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

  const user = await User.deleteOne({ _id: id });
  const profile = await Profile.deleteOne({ user_id: id });
  if (!user.deletedCount && !profile.deletedCount) return notFound();

  return result(200, "User deleted successfully", { id });
});

const setDeletionState = (isDeleted) => lifecycle(isDeleted ? "soft-delete" : "restore", async (id) => {
  const user = await User.findById(id);
  if (!user) return notFound();

  if (isDeleted) await assertNoBookingObligations(id);

  const deletedAt = isDeleted ? (user.deletedAt || new Date()) : null;
  const state = { isDeleted, deletedAt };
  const updated = await User.updateOne({ _id: id }, {
    $set: state,
    $inc: { avatarVersion: 1 },
  });
  if (!updated.matchedCount) return notFound();
  await Profile.updateOne({ user_id: id }, state);

  return result(200, isDeleted ? "User soft-deleted successfully" : "User restored successfully", { id });
});

export const softDeleteUser = setDeletionState(true);
export const restoreUser = setDeletionState(false);
