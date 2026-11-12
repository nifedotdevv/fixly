import { it } from "node:test";
import assert from "node:assert/strict";
import { startBackgroundTask } from "../src/services/backgroundTask.js";

it("does not overlap background passes and drains active work on stop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release;
  let calls = 0;
  const paused = new Promise((resolve) => { release = resolve; });
  const task = startBackgroundTask(async () => { calls++; await paused; }, 10);
  t.mock.timers.tick(10);
  await Promise.resolve();
  assert.equal(calls, 1);
  t.mock.timers.tick(100);
  await Promise.resolve();
  assert.equal(calls, 1);
  const stopping = task.stop();
  release();
  await stopping;
  t.mock.timers.tick(100);
  await Promise.resolve();
  assert.equal(calls, 1);
});
