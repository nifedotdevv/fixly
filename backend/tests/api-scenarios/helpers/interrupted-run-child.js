import { createHarness } from "./harness.js";

let stopping;
let initializing;
const stop = () => stopping ||= (async () => {
  try {
    const harness = await initializing;
    await harness.close();
    process.send?.({ type: "cleaned" });
  } catch {
    process.exitCode = 1;
  } finally {
    if (process.connected) process.disconnect();
  }
})();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
process.once("disconnect", () => stop());
initializing = createHarness();
initializing.then((harness) => {
  if (!stopping) process.send({ type: "ready", databaseName: harness.databaseName, diagnostics: harness.diagnostics() });
}, () => stop());
