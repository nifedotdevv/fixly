import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";

export const waitUntil = async (read, accepts, {
  label = "expected API state", timeoutMs = 15_000, signal, intervalMs = 500,
} = {}) => {
  const deadline = performance.now() + timeoutMs;
  while (true) {
    signal?.throwIfAborted();
    const value = await read();
    if (accepts(value)) return value;
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for ${label}`);
    await delay(Math.min(intervalMs, remaining, 1000), undefined, { signal });
  }
};

// Real elapsed time only. No application or database timestamps are rewritten.
export const waitForServerTime = async (h, timestamp, { timeoutMs, label = "scheduled time" } = {}) => {
  const target = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(target)) throw new Error("A valid scheduled timestamp is required");
  return waitUntil(async () => {
    await h.request("GET", "/", { status: 200 });
    return h.now();
  }, (now) => now >= target + 1000, {
    label,
    timeoutMs: timeoutMs ?? Math.max(15_000, target - h.now() + 15_000),
    signal: h.signal,
    intervalMs: 1000,
  });
};
