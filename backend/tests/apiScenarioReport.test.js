import { it } from "node:test";
import assert from "node:assert/strict";
import { summarizeError, startupRecoveryInfo } from "../scripts/run-api-scenarios.js";

it("scenario failure reports omit credential-bearing messages and response objects", () => {
  const password = "SecretPassword123";
  const token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InNlY3JldCJ9.signature";
  const error = new Error(`Failed login ${password} ${token} mongodb://admin:secret@127.0.0.1:27017`);
  error.expected = { password, token };
  error.actual = { data: { token }, headers: { Authorization: `Bearer ${token}` } };
  const report = JSON.stringify(summarizeError(error));
  for (const secret of [password, token, "mongodb://", "Authorization", '"message"']) {
    assert.equal(report.includes(secret), false);
  }
  assert.equal(summarizeError(error).name, "Error");
});

it("scenario failure reports preserve safe workflow-state and status differences", () => {
  const error = new assert.AssertionError({ actual: "pending", expected: "inspection_confirmed" });
  error.statusCode = 409;
  const report = summarizeError(error);
  assert.equal(report.actual, "pending");
  assert.equal(report.expected, "inspection_confirmed");
  assert.equal(report.statusCode, 409);
});

it("scenario reports do not mistake arbitrary lowercase secrets or error codes for safe state", () => {
  const error = new Error("private failure");
  error.expected = "supersecretpassword";
  error.actual = "another_secret";
  error.code = "SECRETPASSWORD";
  error.name = "PrivatePasswordError";
  const report = summarizeError(error);
  assert.equal(report.expected, undefined);
  assert.equal(report.actual, undefined);
  assert.equal(report.code, undefined);
  assert.equal(report.name, "Error");
});

it("startup cleanup reports retain only validated disposable-database identity", () => {
  const runId = "01234567-89ab-cdef-0123-456789abcdef";
  const error = new AggregateError([], "private startup error");
  error.scenarioRecovery = {
    runId, databaseName: `fixly-test-${runId}`, cleanup: "failed",
    cleanupToken: "private token", uri: "mongodb://private-target", processes: [{ secret: "private" }],
  };
  assert.deepEqual(startupRecoveryInfo(error), { runId, databaseName: `fixly-test-${runId}`, cleanup: "failed", processes: [] });
  error.scenarioRecovery.databaseName = "production";
  assert.equal(startupRecoveryInfo(error), null);
});
