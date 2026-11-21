import dotenv from "dotenv";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import User from "../src/models/users.js";
import Profile from "../src/models/artisanProfile.js";

// Same local-target guard as scripts/simulate-request-payment.js.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
export const assertSimulationTarget = (uri) => {
  if (typeof uri !== "string" || !uri) throw new Error("A local development/test MongoDB URI is required");
  let parsed;
  try { parsed = new URL(uri); } catch {
    throw new Error("Payment simulation requires a valid local MongoDB URI");
  }
  if (parsed.protocol !== "mongodb:" || !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("Payment simulation refuses non-local MongoDB targets");
  }
  return uri;
};

// Local URIs pass. Anything else needs --remote and --confirm-db equal to the connected database name.
export const assertAuditTarget = (uri, { remote = false, confirmDb } = {}, connectedName) => {
  try { return assertSimulationTarget(uri); } catch (error) {
    if (typeof uri !== "string" || !uri) throw error;
    if (!remote || !confirmDb || confirmDb !== connectedName) {
      throw new Error("Refusing non-local MongoDB target: pass --remote --confirm-db <connected database name>");
    }
    return uri;
  }
};

export const parseArgs = (argv) => {
  const options = { apply: null, batch: null, remote: false, confirmDb: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = argv[++i];
    else if (arg === "--batch") options.batch = Number(argv[++i]);
    else if (arg === "--remote") options.remote = true;
    else if (arg === "--confirm-db") options.confirmDb = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.apply !== null && !["ratings", "send-resets"].includes(options.apply)) {
    throw new Error("--apply must be one of: ratings, send-resets");
  }
  if (options.batch !== null && (!Number.isSafeInteger(options.batch) || options.batch < 1)) {
    throw new Error("--batch must be a positive integer");
  }
  return options;
};

const legacyUserFilter = { isDeleted: { $ne: true }, role: { $ne: "admin" }, passwordByteLimit: { $exists: false } };
const ids = (docs) => docs.map((doc) => doc._id.toString());

// Reports only ids, counts and admin metadata. Hashes, tokens and non-admin emails are never read out.
export const buildReport = async () => {
  const [admins, ratingProfiles, legacy, nonBcrypt] = await Promise.all([
    User.find({ role: "admin" }).select("email createdAt isDeleted").lean(),
    Profile.find({ "rating.0": { $exists: true } }).select("_id").lean(),
    User.find({ isDeleted: { $ne: true }, passwordByteLimit: { $exists: false } }).select("_id").lean(),
    User.find({ isDeleted: { $ne: true }, passwordByteLimit: { $exists: false },
      password: { $not: /^\$2[abxy]\$/ } }).select("_id").lean(),
  ]);
  return {
    admins: { count: admins.length, items: admins.map(({ _id, email, createdAt, isDeleted }) =>
      ({ id: _id.toString(), email, createdAt, isDeleted: Boolean(isDeleted) })) },
    legacyRatings: { count: ratingProfiles.length, ids: ids(ratingProfiles) },
    legacyPasswords: { count: legacy.length, ids: ids(legacy), nonBcryptCount: nonBcrypt.length },
  };
};

export const applyRatings = async () => {
  const matched = await Profile.countDocuments({ "rating.0": { $exists: true } });
  const result = await Profile.updateMany({ "rating.0": { $exists: true } }, { $set: { rating: [] } });
  return { matched, modified: result.modifiedCount };
};

// Admins are excluded: they get no write path here. Output carries counts only, never addresses.
export const sendResets = async ({ batch = null, forgotPassword, flushPendingMail } = {}) => {
  if (!forgotPassword || !flushPendingMail) {
    ({ forgotPassword, flushPendingMail } = await import("../src/services/credentials.js"));
  }
  const query = User.find(legacyUserFilter).select("email").sort({ _id: 1 });
  if (batch) query.limit(batch);
  const users = await query.lean();
  let attempted = 0;
  let failed = 0;
  for (const { email } of users) {
    try { await forgotPassword({ email }); attempted++; } catch (error) { failed++; console.error("Reset failed:", error?.name); }
  }
  await flushPendingMail();
  return { eligible: users.length, attempted, failed };
};

export const run = async (options, deps = {}) => {
  const report = await buildReport();
  if (options.apply === "ratings") return { report, applied: { ratings: await applyRatings() } };
  if (options.apply === "send-resets") return { report, applied: { sendResets: await sendResets({ batch: options.batch, ...deps }) } };
  return { report, dryRun: true };
};

const main = async () => {
  dotenv.config({ quiet: true });
  const options = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  try {
    await mongoose.connect(uri);
    assertAuditTarget(uri, options, mongoose.connection.name);
    console.log(JSON.stringify(await run(options), null, 2));
  } finally { await mongoose.disconnect(); }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
