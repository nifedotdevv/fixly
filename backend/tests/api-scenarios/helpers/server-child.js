import mongoose from "mongoose";
import { assertOwnedDatabase } from "./safety.js";

let runtime;
let stopping;
const stop = () => stopping ||= (async () => {
  await runtime?.shutdown();
  if (process.connected) process.disconnect();
})();
process.once("message", async ({ type, owner, listen }) => {
  if (type !== "init") return;
  try {
    const verification = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
    try { await assertOwnedDatabase(verification, owner); } finally { await verification.close(); }
    const { startServer } = await import("../../../src/index.js");
    runtime = await startServer({ host: "127.0.0.1", port: listen?.port ?? 0 });
    if (stopping) { await runtime.shutdown(); return; }
    process.send({ type: "ready", port: runtime.address.port, host: runtime.address.address });
  } catch (error) {
    process.send?.({ type: "failed", error: error.name });
    process.exitCode = 1;
    await stop();
  }
});
process.on("message", ({ type }) => { if (type === "shutdown") stop().catch(() => { process.exitCode = 1; }); });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop().catch(() => { process.exitCode = 1; }));
process.once("disconnect", () => stop().catch(() => { process.exitCode = 1; }));
