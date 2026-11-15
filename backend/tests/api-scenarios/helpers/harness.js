import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import mongoose from "mongoose";
import { assertOwnedDatabase, resolveOwnedUrl, validateMongoTarget } from "./safety.js";

const deadline = async (promise, milliseconds, message) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
};

const childEnvironment = (uri, secret, timing, overrides = {}) => ({
  ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
  NODE_ENV: "development", MONGODB_URI: uri, MONGO_URI: uri, MONGODB_URI_TEST: uri,
  JWT_SECRET: secret, JWT_EXPIRES_IN: "1h", PORT: "0", CLIENT_ORIGIN: "http://127.0.0.1",
  CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "",
  ENABLE_PAYMENT_SIMULATION: "false", API_RATE_LIMIT_MAX: "10000", AUTH_RATE_LIMIT_MAX: "10000",
  ...(timing === "configured" ? { REQUEST_RESPONSE_MIN_MINUTES: "1", INSPECTION_PAYMENT_MINUTES: "1" } : {}),
  ...overrides,
});

export const createHarness = async ({ timing = "configured", onRequest = () => {} } = {}) => {
  if (process.env.NODE_ENV === "production") throw new Error("Scenario harness refuses production execution");
  if (!["configured", "defaults"].includes(timing)) throw new Error("Unknown scenario timing tier");
  const target = validateMongoTarget(process.env.FIXLY_SCENARIO_MONGO_URI);
  const runId = randomUUID();
  const databaseName = `fixly-test-${runId}`;
  const owner = { databaseName, runId, cleanupToken: randomBytes(32).toString("hex") };
  const secret = randomBytes(32).toString("hex");
  const uri = `${target}/${databaseName}`;
  const children = [];
  const origins = [];
  const controllers = new Set();
  const actors = new Map();
  const lockOperations = new Set();
  let connection;
  let databaseMayExist = false;
  let directory;
  let payment;
  let paymentStarting;
  let closed = false;
  let closePromise;
  let wallBase = Date.now();
  let monoBase = performance.now();
  const guard = () => {
    if (closed) throw new Error("Scenario harness is closed");
    h.signal?.throwIfAborted();
    assertHealthy();
  };
  const assertHealthy = () => {
    for (const entry of children) {
      if (entry.started && (entry.process.exitCode !== null || entry.process.signalCode !== null)) {
        throw new Error(`Owned ${entry.label} exited unexpectedly`);
      }
    }
  };
  const verify = () => assertOwnedDatabase(connection, owner);
  const diagnostics = () => children.map(({ label, process: child, port, stdoutLines, stderrLines }) => ({
    label, pid: child.pid, port,
    exitCode: child.exitCode, signalCode: child.signalCode, stdoutLines, stderrLines,
  }));

  const spawnOwned = async (filename, label, overrides = {}, init = {}) => {
    guard();
    await verify();
    guard();
    const child = fork(fileURLToPath(new URL(filename, import.meta.url)), [], {
      cwd: directory, env: childEnvironment(uri, secret, timing, overrides),
      stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [],
    });
    const entry = { process: child, label, stdoutLines: 0, stderrLines: 0 };
    children.push(entry);
    // Never retain raw child output: errors may contain response data or credentials.
    child.stdout.on("data", (chunk) => { entry.stdoutLines += chunk.toString().split("\n").length - 1; });
    child.stderr.on("data", (chunk) => { entry.stderrLines += chunk.toString().split("\n").length - 1; });
    entry.exited = new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
      child.once("error", () => resolve({ code: 1 }));
    });
    const readiness = new Promise((resolve, reject) => {
      const onMessage = (message) => {
        if (message.type === "ready") { cleanup(); resolve(message); }
        else if (message.type === "failed") { cleanup(); reject(new Error(`${label} startup failed`)); }
      };
      const onExit = () => { cleanup(); reject(new Error(`${label} exited before readiness`)); };
      const cleanup = () => {
        child.off("message", onMessage); child.off("exit", onExit); child.off("error", onExit);
      };
      child.on("message", onMessage); child.once("exit", onExit); child.once("error", onExit);
      child.send({ type: "init", owner, ...init }, (error) => { if (error) onExit(); });
    });
    const ready = await deadline(readiness, 15000, `${label} startup timed out`);
    entry.started = true;
    guard();
    return { child, ready, entry };
  };

  const request = async (method, path, { actor, body, status, server = 0, headers = {} } = {}) => {
    guard();
    const origin = origins[server];
    if (!origin) throw new Error("Scenario HTTP server is not owned by this run");
    const url = resolveOwnedUrl(origin, path);
    const controller = new AbortController();
    controllers.add(controller);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000), ...(h.signal ? [h.signal] : [])]);
    const started = performance.now();
    let recorded = false;
    try {
      const response = await fetch(url, {
        method, redirect: "error", signal,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const raw = await response.text();
      let value;
      try { value = JSON.parse(raw); } catch { value = raw; }
      const date = Date.parse(response.headers.get("date"));
      if (Number.isFinite(date)) { wallBase = date; monoBase = performance.now(); }
      onRequest({ method, path: url.pathname, status: response.status, expectedStatus: status,
        durationMs: Math.round(performance.now() - started) });
      recorded = true;
      if (response.status >= 500) throw new Error(`${method} ${url.pathname} returned unexpected server error ${response.status}`);
      if (status !== undefined && response.status !== status) {
        throw new Error(`${method} ${url.pathname}: expected HTTP ${status}, received ${response.status}`);
      }
      return { status: response.status, body: value, headers: response.headers };
    } catch (error) {
      if (!recorded) onRequest({ method, path: url.pathname, status: null, expectedStatus: status,
        failure: error.name, durationMs: Math.round(performance.now() - started) });
      throw error;
    } finally { controllers.delete(controller); }
  };

  const startServer = async ({ apiLimit, authLimit, port = 0 } = {}) => {
    guard();
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Scenario bind port must be valid");
    for (const value of [apiLimit, authLimit]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error("Scenario rate limit must be positive");
    }
    const { ready, entry } = await spawnOwned("./server-child.js", `server-${origins.length}`, {
      ...(apiLimit === undefined ? {} : { API_RATE_LIMIT_MAX: String(apiLimit) }),
      ...(authLimit === undefined ? {} : { AUTH_RATE_LIMIT_MAX: String(authLimit) }),
    }, { listen: { port } });
    if (ready.host !== "127.0.0.1" || !Number.isInteger(ready.port) || ready.port < 1 || ready.port > 65535) {
      throw new Error("Scenario server announced an invalid loopback address");
    }
    entry.port = ready.port;
    const index = origins.push(`http://127.0.0.1:${ready.port}`) - 1;
    const root = await request("GET", "/", { server: index, status: 200 });
    assert.equal(root.body, "Welcome to my Backend Server");
    return index;
  };

  const actor = async (role = "house_owner", { profile = true } = {}) => {
    guard();
    if (!["house_owner", "artisan", "admin"].includes(role)) throw new Error("Invalid scenario actor role");
    const credentials = { email: `${randomUUID()}@fixly.test`, password: `ScenarioA1${randomBytes(16).toString("hex")}` };
    const registered = await request("POST", "/api/v1/auth/register", { status: 201,
      body: { firstName: "Scenario", lastName: "Account", ...credentials, role: role === "admin" ? "house_owner" : role } });
    const id = registered.body.data.id;
    if (role === "admin") {
      await verify();
      guard();
      const changed = await connection.collection("users").updateOne({ _id: new mongoose.Types.ObjectId(id), email: credentials.email }, { $set: { role: "admin" } }, { maxTimeMS: 5000 });
      assert.equal(changed.modifiedCount, 1);
    }
    const loggedIn = await request("POST", "/api/v1/auth/login", { body: credentials, status: 200 });
    const result = { id, role, ...credentials, token: loggedIn.body.data.token };
    actors.set(id, result);
    if (role === "artisan" && profile) {
      const professional = await request("POST", "/api/v1/artisan/profile", { actor: result, status: 201, body: {
        professional_headline: "Scenario experienced plumber", profession: "Plumber", experience_years: 3,
        phone_number: "08012345678", starting_price: 5000,
        residential_address: "Synthetic artisan home", office_address: "Synthetic artisan office",
      } });
      result.profileId = professional.body.data.id;
    }
    return result;
  };

  const pay = async (event) => {
    guard();
    await verify();
    if (!paymentStarting) {
      paymentStarting = spawnOwned("./payment-child.js", "payment-driver", { ENABLE_PAYMENT_SIMULATION: "true" })
        .then((result) => { payment = result.child; return payment; });
    }
    await paymentStarting;
    guard();
    const id = randomUUID();
    return deadline(new Promise((resolve, reject) => {
      const onMessage = (message) => {
        if (message.type !== "result" || message.id !== id) return;
        cleanup();
        if (message.error) {
          const error = new Error(`Simulated payment rejected (${message.error.statusCode || message.error.name})`);
          error.statusCode = message.error.statusCode;
          reject(error);
        } else resolve(message.result);
      };
      const onExit = () => { cleanup(); reject(new Error("Scenario payment driver exited")); };
      const cleanup = () => { payment.off("message", onMessage); payment.off("exit", onExit); };
      payment.on("message", onMessage); payment.once("exit", onExit);
      payment.send({ type: "pay", id, event }, (error) => { if (error) onExit(); });
    }), 10000, "Scenario payment timed out");
  };

  const withLock = (id, action, callback) => {
    guard();
    if (!actors.has(id) || !["service-request", "delete", "soft-delete", "restore", "update-role"].includes(action)) {
      throw new Error("Lock fixture requires a run-owned actor and supported action");
    }
    const operation = (async () => {
      await verify();
      guard();
      const token = randomUUID();
      await connection.collection("accountlifecyclelocks").insertOne({ _id: new mongoose.Types.ObjectId(id), token, action,
        host: "owned-scenario-fixture", processId: process.pid, startedAt: new Date() });
      try { return await callback(); }
      finally {
        await verify();
        await connection.collection("accountlifecyclelocks").deleteOne({ _id: new mongoose.Types.ObjectId(id), token });
      }
    })();
    lockOperations.add(operation);
    operation.then(() => lockOperations.delete(operation), () => lockOperations.delete(operation));
    return operation;
  };

  const close = () => closePromise ||= (async () => {
    closed = true;
    for (const controller of controllers) controller.abort();
    const errors = [];
    let stopped = true;
    for (const entry of [...children].reverse()) {
      const child = entry.process;
      try {
        if (child.exitCode === null && child.signalCode === null) {
          if (child.connected) child.send({ type: "shutdown" }, () => {});
          try { await deadline(entry.exited, 5000, "Owned child shutdown timed out"); }
          catch {
            child.kill("SIGTERM");
            try { await deadline(entry.exited, 2000, "Owned child termination timed out"); }
            catch { child.kill("SIGKILL"); await deadline(entry.exited, 2000, "Owned child could not be stopped"); }
          }
        }
      } catch { stopped = false; errors.push(new Error(`Could not stop owned ${entry.label}`)); }
    }
    try { await deadline(Promise.allSettled([...lockOperations]), 5000, "Owned fixture did not stop"); }
    catch (error) { stopped = false; errors.push(error); }
    if (connection) {
      try {
        if (!stopped) throw new Error("Refusing cleanup while owned writers may still run");
        if (connection.readyState !== 1 && databaseMayExist) {
          throw new Error("Refusing unverified cleanup: scenario data may remain while MongoDB is disconnected");
        }
        if (connection.readyState === 1 && databaseMayExist) {
          await verify();
          await connection.dropDatabase();
        }
      } catch (error) { errors.push(error); }
      finally { await connection.close().catch(() => { errors.push(new Error("Scenario DB connection did not close")); }); }
    }
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => { errors.push(new Error("Scenario temporary directory cleanup failed")); });
    if (errors.length) throw new Error(`Scenario cleanup failed for ${databaseName}: ${errors.map((error) => error.message).join("; ")}`);
  })();

  const h = { runId, databaseName, request, actor, pay, startServer, withLock, close, diagnostics, assertHealthy,
    now: () => wallBase + performance.now() - monoBase,
    countPayments: async (requestId) => {
      guard(); await verify();
      return connection.collection("paymentevents").countDocuments({ requestId: new mongoose.Types.ObjectId(requestId) }, { maxTimeMS: 5000 });
    },
    assertNoLocks: async () => {
      guard(); await verify();
      assert.equal(await connection.collection("accountlifecyclelocks").countDocuments({}, { maxTimeMS: 5000 }), 0, "Scenario left account locks behind");
    },
  };
  try {
    directory = await mkdtemp(join(tmpdir(), "fixly-api-scenarios-"));
    connection = mongoose.createConnection(target, { dbName: databaseName, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000, readPreference: "primary" });
    await connection.asPromise();
    databaseMayExist = true;
    await connection.collection("scenarioownership").insertOne({ _id: runId, cleanupToken: owner.cleanupToken });
    await verify();
    await startServer();
    return h;
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      const failed = new AggregateError([error, cleanupError], "Scenario startup and cleanup failed");
      failed.scenarioRecovery = { runId, databaseName, cleanup: "failed", processes: diagnostics() };
      throw failed;
    }
    error.scenarioRecovery = { runId, databaseName, cleanup: "completed", processes: diagnostics() };
    throw error;
  }
};
