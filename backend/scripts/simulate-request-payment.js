import dotenv from "dotenv";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { applyVerifiedPayment } from "../src/services/requests/verifiedPayments.js";

export const assertSimulationAllowed = (env = process.env) => {
  if (!["development", "test"].includes(env.NODE_ENV) || env.ENABLE_PAYMENT_SIMULATION !== "true") {
    throw new Error("Payment simulation requires development/test mode and ENABLE_PAYMENT_SIMULATION=true");
  }
};
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
const main = async () => {
  dotenv.config({ quiet: true });
  assertSimulationAllowed();
  const [requestId, purpose, rawAmount, currency, externalReference] = process.argv.slice(2);
  if (!requestId || !purpose || !rawAmount || !currency || !externalReference) {
    throw new Error("Usage: node scripts/simulate-request-payment.js REQUEST_ID PURPOSE AMOUNT CURRENCY UNIQUE_REFERENCE");
  }
  const uri = assertSimulationTarget(process.env.MONGODB_URI_TEST || process.env.MONGODB_URI || process.env.MONGO_URI);
  try {
    await mongoose.connect(uri);
    console.log(JSON.stringify(await applyVerifiedPayment({ requestId, purpose, amount: Number(rawAmount), currency, externalReference })));
    console.log("Simulated verified event only. This command does not collect, hold, release, or refund funds.");
  } finally { await mongoose.disconnect(); }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
