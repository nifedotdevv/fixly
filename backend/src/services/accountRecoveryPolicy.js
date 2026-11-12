import bcrypt from "bcryptjs";
import { positiveInteger } from "../config/backgroundJobs.js";

export const recoveryDeadline = (user) => {
  if (!user.isDeleted || user.deletionReason !== "self" || !user.deletedAt) return null;
  const deletedAt = new Date(user.deletedAt).getTime();
  if (!Number.isFinite(deletedAt)) return null;
  return deletedAt + positiveInteger("SOFT_DELETE_GRACE_DAYS", 30, 3650) * 86_400_000;
};

export const verifiesPassword = async (user, password) => Boolean(
  user && typeof password === "string" && password.length > 0 &&
  !(user.passwordByteLimit === 72 && bcrypt.truncates(password)) &&
  await bcrypt.compare(password, user.password)
);
