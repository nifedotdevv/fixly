// Schedule only after a pass finishes; stop() also drains the current pass.
export const startBackgroundTask = (task, intervalMs, { runImmediately = false } = {}) => {
  let stopped = false;
  let timer;
  let running;
  const schedule = (delay = intervalMs) => {
    if (stopped) return;
    timer = setTimeout(() => {
      running = Promise.resolve().then(task).catch((error) => {
        console.error("Background maintenance failed:", error.name);
      }).finally(() => schedule());
    }, delay);
    timer.unref();
  };
  schedule(runImmediately ? 0 : intervalMs);
  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
};

// Fire-and-forget work that must never reject or delay the caller. Tracked so tests can flush it.
const inFlight = new Set();
export const dispatchDetached = (work, label) => {
  const run = new Promise((resolve) => resolve(work())).catch((error) => {
    console.error(`${label} failed:`, error?.name);
  }).finally(() => inFlight.delete(run));
  inFlight.add(run);
};
export const flushDetached = async () => { while (inFlight.size) await Promise.all([...inFlight]); };
