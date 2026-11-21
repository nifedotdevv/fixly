import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/users.js";
import { runAccountLifecycle } from "./accountLifecycle.js";
import { requireCondition } from "./requests/rules.js";
import { credentialMail, mailSettings, actionUrl } from "./credentialMail.js";
import { AccountLifecycleConflictError } from "../utils/errors.js";

const digest = (token) => createHash("sha256").update(token).digest("hex");
const selected = "+authVersion +passwordByteLimit +passwordReset +emailChange +lifecycleAction";
const clearTokens = { passwordReset: 1, emailChange: 1 };
const invalidToken = () => requireCondition(false, "This link is invalid or expired. Request a new one.", 400);
const activeActor = async (actor) => {
  const user = await User.findById(actor._id).select(selected);
  requireCondition(user && !user.isDeleted && !user.lifecycleAction && (user.authVersion || 0) === (actor.authVersion || 0),
    "Your session is no longer valid. Sign in again.", 401);
  return user;
};
const checkPassword = async (user, password) => {
  // A legacy bcrypt hash cannot establish whether its original secret exceeded 72 bytes.
  // Mailbox recovery is required before using it as proof for a sensitive credential change.
  requireCondition(user.passwordByteLimit === 72,
    "Reset your password using your email address before changing account credentials.", 409);
  requireCondition(!bcrypt.truncates(password) && await bcrypt.compare(password, user.password),
    "Current password is incorrect", 401);
};
const createToken = (user, email) => {
  const token = randomBytes(32).toString("hex");
  return { token, record: { hash: digest(token), expiresAt: new Date(Date.now() + 30 * 60000),
    authVersion: user.authVersion || 0, email } };
};
const configured = (purpose) => { mailSettings(); actionUrl(purpose); };

export const forgotPassword = async ({ email }) => {
  // Check configuration before account lookup: a missing mail setup must not reveal account existence.
  configured("passwordReset");
  const initial = await User.findOne({ email, isDeleted: { $ne: true } }).select("_id");
  if (!initial) return;
  try {
    await runAccountLifecycle(initial._id, "credentials", async () => {
      const user = await User.findOne({ _id: initial._id, email, isDeleted: { $ne: true } }).select(selected);
      if (!user) return;
      const { token, record } = createToken(user, email);
      await User.updateOne({ _id: user._id, isDeleted: { $ne: true } }, { $set: { passwordReset: record } });
      try { await credentialMail.send({ to: email, purpose: "passwordReset", token }); }
      catch {
        // Suppress provider failures just like unknown addresses, and invalidate the undelivered token.
        await User.updateOne({ _id: user._id, "passwordReset.hash": record.hash }, { $unset: { passwordReset: 1 } });
      }
    });
  } catch (error) {
    // Contention cannot disclose that an account exists through a different forgot response.
    if (!(error instanceof AccountLifecycleConflictError)) throw error;
  }
};

const consume = async (purpose, token, operation) => {
  const hash = digest(token);
  const initial = await User.findOne({ [`${purpose}.hash`]: hash, isDeleted: { $ne: true } }).select("_id");
  if (!initial) return invalidToken();
  return runAccountLifecycle(initial._id, "credentials", async () => {
    const user = await User.findById(initial._id).select(selected);
    const record = user?.[purpose];
    if (!user || user.isDeleted || !record || record.hash !== hash || record.expiresAt <= new Date()
      || record.authVersion !== (user.authVersion || 0) || (purpose === "passwordReset" && record.email !== user.email)) return invalidToken();
    // Database clock and exact token guard protect the final consume after asynchronous bcrypt work.
    const filter = { _id: user._id, isDeleted: { $ne: true }, [`${purpose}.hash`]: hash,
      $expr: { $gt: [`$${purpose}.expiresAt`, "$$NOW"] } };
    const changes = await operation(user, record);
    const updated = await User.updateOne(filter, { $set: changes, $unset: clearTokens, $inc: { authVersion: 1 } }, { runValidators: true });
    if (!updated.matchedCount) return invalidToken();
  });
};

export const resetPassword = ({ token, password }) => consume("passwordReset", token, async () => ({
  password: await bcrypt.hash(password, 12), passwordByteLimit: 72,
}));

export const changePassword = (actor, { currentPassword, password }) => runAccountLifecycle(actor._id, "credentials", async () => {
  const user = await activeActor(actor);
  await checkPassword(user, currentPassword);
  const hash = await bcrypt.hash(password, 12);
  await User.updateOne({ _id: user._id, isDeleted: { $ne: true } }, {
    $set: { password: hash, passwordByteLimit: 72 }, $unset: clearTokens, $inc: { authVersion: 1 },
  }, { runValidators: true });
});

export const requestEmailChange = (actor, { currentPassword, email }) => runAccountLifecycle(actor._id, "credentials", async () => {
  const user = await activeActor(actor);
  await checkPassword(user, currentPassword);
  requireCondition(email !== user.email, "Choose a different email address", 400);
  configured("emailChange");
  requireCondition(!await User.exists({ email }), "Email address is unavailable", 409);
  const { token, record } = createToken(user, email);
  await User.updateOne({ _id: user._id }, { $set: { emailChange: record } });
  try { await credentialMail.send({ to: email, purpose: "emailChange", token }); }
  catch (error) {
    await User.updateOne({ _id: user._id, "emailChange.hash": record.hash }, { $unset: { emailChange: 1 } });
    throw error;
  }
});

export const confirmEmailChange = ({ token }) => consume("emailChange", token, async (_user, record) => {
  requireCondition(!await User.exists({ email: record.email }), "Email address is unavailable", 409);
  return { email: record.email };
});
