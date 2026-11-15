import { timingSafeEqual } from "node:crypto";

export const validateMongoTarget = (value = "mongodb://127.0.0.1:27017") => {
  if (typeof value !== "string") throw new Error("Scenario MongoDB target must use literal loopback only");
  const match = /^mongodb:\/\/(127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?\/?$/.exec(value);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) {
    throw new Error("Scenario MongoDB target must use literal loopback without credentials, database, or options");
  }
  return value.replace(/\/$/, "");
};

export const assertOwnedDatabase = async (connection, owner) => {
  const { databaseName, runId, cleanupToken } = owner;
  if (!/^fixly-test-[0-9a-f-]{36}$/.test(databaseName) || connection.name !== databaseName ||
      databaseName !== `fixly-test-${runId}` || typeof cleanupToken !== "string" || cleanupToken.length !== 64) {
    throw new Error("Refusing access to a database not owned by this scenario run");
  }
  const marker = await connection.collection("scenarioownership").findOne({ _id: runId }, { maxTimeMS: 5000 });
  const actual = Buffer.from(marker?.cleanupToken || "");
  const expected = Buffer.from(cleanupToken);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Refusing access: scenario database ownership token does not match");
  }
};

export const resolveOwnedUrl = (origin, path) => {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Scenario requests must use a relative owned-server path");
  }
  const base = new URL(origin);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || !base.port) {
    throw new Error("Scenario HTTP origin must be an owned loopback server");
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("Scenario request escaped the owned HTTP origin");
  return url;
};
