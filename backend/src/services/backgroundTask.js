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
