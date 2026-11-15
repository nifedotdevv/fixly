import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { REQUEST_STATUS } from "../src/constants/serviceRequests.js";

const backendRoot = fileURLToPath(new URL("../", import.meta.url));
const supportedTiers = new Set(["fast", "journeys", "defaults", "all"]);
const timeoutMs = { fast: 90_000, journeys: 240_000, defaults: 22 * 60_000, all: 360_000 };

const safePath = (path) => path.split("?")[0].replace(/\b[\da-f]{24}\b/gi, ":id");
const serviceBase = "/api/v1/service-requests";
const serviceRoutes = [
  `POST ${serviceBase}`, `GET ${serviceBase}`, `GET ${serviceBase}/:id`,
  ...["notes", "accept", "reject", "cancel", "inspection/complete", "quote", "quote/approve", "quote/decline",
    "repair/start", "repair/complete", "completion/confirm", "problems"].map((action) => `POST ${serviceBase}/:id/${action}`),
];
export const summarizeCoverage = (requests) => serviceRoutes.map((route) => {
  const calls = requests.filter((request) => `${request.method} ${request.path}` === route);
  return {
    route,
    success: calls.some((request) => request.status >= 200 && request.status < 300),
    denied: calls.some((request) => [401, 403, 404].includes(request.status)),
    statuses: [...new Set(calls.map((request) => request.status))].sort((a, b) => a - b),
    scenarios: [...new Set(calls.map((request) => request.scenario))].sort(),
  };
});
const safeStates = new Set([...Object.values(REQUEST_STATUS), "reserved", "confirmed", "released", "expired",
  "processing", "applied", "reconciliation_required"]);
const safeErrorNames = new Set(["Error", "AssertionError", "AggregateError", "AbortError", "TimeoutError", "TypeError",
  "RangeError", "SyntaxError", "MongooseServerSelectionError", "MongoNetworkError", "MongoServerError", "RequestError"]);
const safeErrorCodes = new Set(["ERR_ASSERTION", "EADDRINUSE", "EPERM", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
  "ABORT_ERR", "SCENARIO_INTERRUPTED", "SCENARIO_TIMEOUT", "SCENARIO_COVERAGE_GAP"]);
const safeScalar = (value) => typeof value === "number" || typeof value === "boolean"
  || safeStates.has(value) ? value : undefined;

// Assertion errors may contain full response bodies. Persist only safe scalar
// state differences and call sites; never serialize arbitrary errors/requests.
export const summarizeError = (error) => ({
  name: safeErrorNames.has(error?.name) ? error.name : "Error",
  code: safeErrorCodes.has(error?.code) ? error.code : undefined,
  statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : undefined,
  expected: safeScalar(error?.expected),
  actual: safeScalar(error?.actual),
  frames: typeof error?.stack === "string"
    ? error.stack.split("\n").slice(1).filter((line) => /^\s+at /.test(line)).slice(0, 6)
    : [],
});

export const startupRecoveryInfo = (error) => {
  const info = error?.scenarioRecovery;
  if (!info || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(info.runId)
    || info.databaseName !== `fixly-test-${info.runId}` || !["completed", "failed"].includes(info.cleanup)) return null;
  const processes = Array.isArray(info.processes) ? info.processes
    .filter((entry) => /^(server-[0-9]+|payment-driver)$/.test(entry?.label))
    .map((entry) => ({
      label: entry.label,
      pid: Number.isSafeInteger(entry.pid) && entry.pid > 0 ? entry.pid : undefined,
      port: Number.isInteger(entry.port) && entry.port > 0 && entry.port < 65536 ? entry.port : undefined,
      exitCode: Number.isInteger(entry.exitCode) ? entry.exitCode : null,
      signalCode: ["SIGTERM", "SIGKILL", "SIGINT"].includes(entry.signalCode) ? entry.signalCode : null,
    })) : [];
  return { runId: info.runId, databaseName: info.databaseName, cleanup: info.cleanup, processes };
};

export const runScenarios = async (tier) => {
  if (!supportedTiers.has(tier)) throw new Error("Unsupported API scenario tier");
  const started = performance.now();
  const controller = new AbortController();
  const report = {
    schemaVersion: 1, runId: randomUUID(), tier, nodeVersion: process.version,
    startedAt: new Date().toISOString(), payments: "simulated trusted events; no provider integration",
    timing: tier === "defaults" ? "production response-window defaults" : "supported one-minute response minimum",
    scenarios: [], requests: [], cleanup: "not_started", success: false,
  };
  try {
    report.gitRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: backendRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000,
    }).trim();
    report.dirtyWorkingTree = execFileSync("git", ["status", "--porcelain"], {
      cwd: backendRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000,
    }).trim().length > 0;
  } catch { report.gitRevision = "unavailable"; }
  const reportDir = new URL("../artifacts/api-scenarios/", import.meta.url);
  let harness;
  let activeScenario;
  let watchdog;
  const onRequest = ({ method, path, status, expectedStatus, durationMs, failure }) => {
    if (report.requests.length >= 20_000) return;
    report.requests.push({
      scenario: activeScenario || "setup", method, path: safePath(path), status, expectedStatus, durationMs,
      ...(failure ? { failure: safeErrorNames.has(failure) ? failure : "Error" } : {}),
    });
  };
  const scenario = async (id, title, operation) => {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (!/^[A-Z][\w-]{0,39}$/.test(id) || typeof title !== "string" || title.length > 200) {
      throw new Error("Invalid scenario metadata");
    }
    activeScenario = id;
    const entry = { id, title, passed: false };
    report.scenarios.push(entry);
    const before = performance.now();
    process.stdout.write(`RUN ${id}: ${title}\n`);
    try {
      await operation();
      entry.passed = true;
      process.stdout.write(`PASS ${id}\n`);
    } catch (error) {
      entry.error = summarizeError(error);
      process.stderr.write(`FAIL ${id}: ${entry.error.name}\n`);
      throw error;
    } finally {
      entry.durationMs = Math.round(performance.now() - before);
      activeScenario = undefined;
    }
  };
  const execute = async () => {
    if (tier === "fast" || tier === "all") {
      const { runFast } = await import("../tests/api-scenarios/fast.js");
      await runFast(harness);
    }
    if (tier === "journeys" || tier === "defaults" || tier === "all") {
      const { runJourneys } = await import("../tests/api-scenarios/journeys.js");
      await runJourneys(harness, { defaults: tier === "defaults" });
    }
    await harness.assertHealthy?.();
    await harness.assertNoLocks();
    if (tier === "all") {
      const gaps = summarizeCoverage(report.requests).filter((route) => !route.success || !route.denied);
      if (gaps.length) {
        report.coverageGaps = gaps;
        throw Object.assign(new Error("Combined API run has route coverage gaps"), { code: "SCENARIO_COVERAGE_GAP" });
      }
    }
  };
  const cancel = (reason) => { if (!controller.signal.aborted) controller.abort(reason); };
  const interrupted = () => cancel(Object.assign(new Error("Scenario run interrupted"), { code: "SCENARIO_INTERRUPTED" }));
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  watchdog = setTimeout(() => cancel(Object.assign(new Error("Scenario run exceeded its overall deadline"), { code: "SCENARIO_TIMEOUT" })), timeoutMs[tier]);
  watchdog.unref();
  try {
    const { createHarness } = await import("../tests/api-scenarios/helpers/harness.js");
    // Startup has its own finite deadline. Do not abandon an in-progress setup:
    // retain ownership of its eventual result so signals cannot leak children.
    harness = await createHarness({ timing: tier === "defaults" ? "defaults" : "configured", onRequest });
    report.runId = harness.runId;
    report.databaseName = harness.databaseName;
    harness.signal = controller.signal;
    harness.scenario = scenario;
    controller.signal.throwIfAborted();
    const aborted = new Promise((resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    });
    await Promise.race([execute(), aborted]);
    report.success = true;
  } catch (error) {
    report.error = summarizeError(error);
    if (!harness) {
      const recovery = startupRecoveryInfo(error);
      if (recovery) {
        report.runId = recovery.runId;
        report.databaseName = recovery.databaseName;
        report.cleanup = recovery.cleanup;
        report.processes = recovery.processes;
      }
    }
    process.stderr.write(`API scenario run failed (${report.error.name}); inspect its redacted report.\n`);
  } finally {
    clearTimeout(watchdog);
    cancel(new Error("Scenario run finished"));
    try {
      if (harness) {
        await harness.close();
        report.cleanup = "completed";
      } else {
        // createHarness handles partial startup teardown before throwing.
        if (report.cleanup === "not_started") {
          report.cleanup = report.error?.name === "AggregateError" ? "failed" : "handled_during_startup";
        }
      }
    } catch (error) {
      report.success = false;
      report.cleanup = "failed";
      report.cleanupError = summarizeError(error);
      process.stderr.write(`Cleanup failed for run-owned database ${report.databaseName || "unavailable"}; stop its owned writers before manual inspection.\n`);
    }
    process.removeListener("SIGINT", interrupted);
    process.removeListener("SIGTERM", interrupted);
    report.finishedAt = new Date().toISOString();
    report.durationMs = Math.round(performance.now() - started);
    report.routeCoverage = summarizeCoverage(report.requests);
    if (harness?.diagnostics) report.processes = harness.diagnostics();
    await mkdir(reportDir, { recursive: true });
    const reportFile = new URL(`${report.runId}-${tier}.json`, reportDir);
    await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(`Report: ${fileURLToPath(reportFile)}`);
    console.log(`${report.scenarios.filter((entry) => entry.passed).length}/${report.scenarios.length} scenarios passed; cleanup ${report.cleanup}; ${report.durationMs}ms`);
  }
  return report;
};

const main = async () => {
  const { values } = parseArgs({ options: { tier: { type: "string", default: "fast" } } });
  const report = await runScenarios(values.tier);
  if (!report.success) process.exitCode = 1;
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`API scenario runner failed (${summarizeError(error).name})`);
    process.exitCode = 1;
  });
}
