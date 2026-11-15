import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { validateMongoTarget, assertOwnedDatabase, resolveOwnedUrl } from "./api-scenarios/helpers/safety.js";
import { createHarness } from "./api-scenarios/helpers/harness.js";

const owner = () => {
  const runId = randomUUID();
  return { runId, databaseName: `fixly-test-${runId}`, cleanupToken: randomBytes(32).toString("hex") };
};

describe("real-HTTP scenario safety guards", () => {
  it("accepts only literal local MongoDB listeners without database or options", () => {
    assert.equal(validateMongoTarget(), "mongodb://127.0.0.1:27017");
    assert.equal(validateMongoTarget("mongodb://[::1]:27018/"), "mongodb://[::1]:27018");
    for (const target of ["mongodb://localhost:27017", "mongodb+srv://example.com", "mongodb://example.com", "mongodb://127.0.0.1/production",
      "mongodb://127.0.0.1/?authSource=admin", "mongodb://user:secret@127.0.0.1", "mongodb://127.0.0.1,example.com", "mongodb://127.0.0.1:0", "mongodb://127.0.0.1:65536"]) {
      assert.throws(() => validateMongoTarget(target), /literal loopback/);
    }
  });

  it("refuses foreign names and mismatched ownership tokens before fixture access", async () => {
    const expected = owner();
    let reads = 0;
    const connection = { name: "production", collection: () => ({ findOne: async () => { reads++; return expected; } }) };
    await assert.rejects(() => assertOwnedDatabase(connection, expected), /not owned/);
    assert.equal(reads, 0);
    connection.name = expected.databaseName;
    connection.collection = () => ({ findOne: async () => ({ cleanupToken: "wrong-token" }) });
    await assert.rejects(() => assertOwnedDatabase(connection, expected), /token/);
    connection.collection = () => ({ findOne: async () => expected });
    await assertOwnedDatabase(connection, expected);
  });

  it("blocks absolute URLs, protocol-relative paths and escaped origins", () => {
    const origin = "http://127.0.0.1:54321";
    assert.equal(resolveOwnedUrl(origin, "/api/v1/service-requests?page=1").origin, origin);
    for (const path of ["https://example.com", "//example.com/path", "\\\\example.com", "/\\example.com"]) {
      assert.throws(() => resolveOwnedUrl(origin, path), /owned-server/);
    }
    assert.throws(() => resolveOwnedUrl("http://example.com:54321", "/"), /loopback/);
  });

  it("refuses production execution before connecting", async (t) => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    t.after(() => prior === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = prior);
    await assert.rejects(createHarness, /production/);
  });

  it("refuses a real owned database with the wrong cleanup token without changing its records", { timeout: 15000 }, async () => {
    const expected = owner();
    const connection = mongoose.createConnection(validateMongoTarget(process.env.FIXLY_SCENARIO_MONGO_URI), {
      dbName: expected.databaseName, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 5000,
    });
    try {
      await connection.asPromise();
      await connection.collection("scenarioownership").insertOne({ _id: expected.runId, cleanupToken: expected.cleanupToken });
      await connection.collection("sentinels").insertOne({ _id: "preserve-me" });
      await assert.rejects(() => assertOwnedDatabase(connection, { ...expected, cleanupToken: randomBytes(32).toString("hex") }), /token/);
      assert.equal(await connection.collection("sentinels").countDocuments(), 1);
      await assertOwnedDatabase(connection, expected);
      await connection.dropDatabase();
    } finally { await connection.close(); }
  });

  it("cleans up a failed bind while keeping the original owned API usable", { timeout: 20000 }, async () => {
    const harness = await createHarness();
    try {
      const [{ port }] = harness.diagnostics();
      await assert.rejects(() => harness.startServer({ port }), /startup failed/);
      await harness.request("GET", "/", { status: 200 });
      harness.assertHealthy();
    } finally { await harness.close(); }
    assert.ok(harness.diagnostics().every((child) => child.exitCode !== null || child.signalCode !== null));
  });

  it("handles interrupted runner teardown without leaving owned HTTP servers or database records", { timeout: 40000 }, async () => {
    const child = fork(fileURLToPath(new URL("./api-scenarios/helpers/interrupted-run-child.js", import.meta.url)), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"], execArgv: [],
      env: { PATH: process.env.PATH, NODE_ENV: "test",
        ...(process.env.FIXLY_SCENARIO_MONGO_URI ? { FIXLY_SCENARIO_MONGO_URI: process.env.FIXLY_SCENARIO_MONGO_URI } : {}) },
    });
    let timer;
    const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
    const ready = new Promise((resolve, reject) => {
      child.on("message", (message) => { if (message.type === "ready") resolve(message); });
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Interrupted-run fixture exited before readiness")));
      // Cover the harness's own 5s DB + 15s child startup deadlines.
      timer = setTimeout(() => reject(new Error("Interrupted-run fixture startup timed out")), 25000);
    });
    try {
      const { databaseName, diagnostics } = await ready;
      clearTimeout(timer);
      child.kill("SIGTERM");
      assert.equal(await exited, 0);
      for (const { port } of diagnostics) {
        if (port) await assert.rejects(() => fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }));
      }
      const verification = mongoose.createConnection(validateMongoTarget(process.env.FIXLY_SCENARIO_MONGO_URI), {
        dbName: databaseName, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 5000,
      });
      try {
        await verification.asPromise();
        assert.deepEqual(await verification.db.listCollections().toArray(), []);
      } finally { await verification.close(); }
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await exited;
      }
    }
  });

  it("isolates simultaneous servers/databases, verifies HTTP actors and drains owned resources", { timeout: 30000 }, async () => {
    const results = await Promise.allSettled([createHarness(), createHarness()]);
    const instances = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    const [first, second] = instances;
    try {
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
      assert.notEqual(first.databaseName, second.databaseName);
      assert.notEqual(first.runId, second.runId);
      const actor = await first.actor("house_owner");
      await first.request("GET", "/api/v1/users/me", { actor, status: 200 });
      await second.request("GET", "/api/v1/users/me", { actor, status: 401 });
      const server = await first.startServer();
      await first.request("GET", "/api/v1/users/me", { actor, status: 200, server });
      await assert.rejects(() => first.request("GET", "https://example.com"), /owned-server/);
      await first.assertNoLocks();
    } finally {
      await Promise.all(instances.map((instance) => instance.close()));
    }
    await assert.rejects(() => first.request("GET", "/"), /closed/);
    await assert.rejects(() => first.actor(), /closed/);
    await assert.rejects(() => first.startServer(), /closed/);
    await assert.rejects(() => first.pay({}), /closed/);
    await first.close();
    for (const instance of instances) {
      assert.ok(instance.diagnostics().every((child) => child.exitCode !== null || child.signalCode !== null));
    }
  });
});
