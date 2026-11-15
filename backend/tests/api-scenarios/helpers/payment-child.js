import mongoose from "mongoose";
import { assertOwnedDatabase } from "./safety.js";
import { assertSimulationAllowed } from "../../../scripts/simulate-request-payment.js";
import { applyVerifiedPayment } from "../../../src/services/requests/verifiedPayments.js";

let owner;
let closing = false;
let stopping;
const active = new Set();
const stop = () => stopping ||= (async () => {
  closing = true;
  await Promise.allSettled([...active]);
  await mongoose.disconnect();
  if (process.connected) process.disconnect();
})();
const handle = async (message) => {
  try {
    if (message.type === "init") {
      assertSimulationAllowed();
      owner = message.owner;
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      await assertOwnedDatabase(mongoose.connection, owner);
      await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
      process.send({ type: "ready" });
      return;
    }
    if (message.type !== "pay" || !owner || closing) throw new Error("Payment driver is unavailable");
    assertSimulationAllowed();
    await assertOwnedDatabase(mongoose.connection, owner);
    const request = await mongoose.connection.collection("servicerequests").findOne({ _id: new mongoose.Types.ObjectId(message.event.requestId) });
    if (!request) throw new Error("Payment driver request does not belong to this run");
    const result = await applyVerifiedPayment(message.event);
    process.send({ type: "result", id: message.id, result });
  } catch (error) {
    process.send?.({ type: message.type === "init" ? "failed" : "result", id: message.id,
      error: { name: error.name, statusCode: Number.isInteger(error.statusCode) ? error.statusCode : undefined } });
  }
};
process.on("message", (message) => {
  if (message.type === "shutdown") { stop().catch(() => { process.exitCode = 1; }); return; }
  if (closing) return;
  const operation = handle(message);
  active.add(operation);
  operation.finally(() => active.delete(operation));
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop().catch(() => { process.exitCode = 1; }));
process.once("disconnect", () => stop().catch(() => { process.exitCode = 1; }));
