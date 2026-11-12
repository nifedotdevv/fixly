import "dotenv/config";
import { parseArgs } from "node:util";
import mongoose from "mongoose";
import AccountLifecycleLock from "../src/models/accountLifecycleLock.js";
import { recoverLifecycleLock } from "../src/services/accountLifecycleRecovery.js";

const main = async () => {
  const { values } = parseArgs({
    options: {
      id: { type: "string" },
      token: { type: "string" },
      "confirm-writers-stopped": { type: "boolean", default: false },
    },
  });
  if (!mongoose.isObjectIdOrHexString(values.id)) throw new Error("Provide --id with a valid account ObjectId");
  if (values["confirm-writers-stopped"] && !values.token) throw new Error("Recovery requires --token with the exact lock token");
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI (or MONGO_URI) is required");

  await mongoose.connect(uri, { readPreference: "primary", serverSelectionTimeoutMS: 5000 });
  try {
    const lock = await AccountLifecycleLock.findById(values.id).lean();
    if (!lock) {
      console.log("No lifecycle lock exists for this account");
      return;
    }
    console.log(JSON.stringify({
      id: lock._id.toString(), token: lock.token, action: lock.action,
      host: lock.host, processId: lock.processId, startedAt: lock.startedAt,
    }, null, 2));
    if (!values["confirm-writers-stopped"]) {
      console.log("Inspection only. Stop/fence the old writers and verify their database operations have finished before supplying --token and --confirm-writers-stopped.");
      return;
    }
    const removed = await recoverLifecycleLock(values.id, values.token, { writersStopped: true });
    if (!removed) throw new Error("Lock token changed; no lock was removed. Inspect the current owner before retrying.");
    console.log("Verified lock token removed. Retry the operation or run lifecycle recovery to finish any persisted cascade.");
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Lifecycle lock recovery failed:", error.message);
  process.exitCode = 1;
});
