import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-last-admin-test-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const { credentialIpLimit } = await import("../src/middleware/credentialLimits.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Lock.init()]);
const hash = await bcrypt.hash("StrongPass123", 4);
const mk = (extra = {}) => User.create({ firstName: "A", lastName: "B", email: `${randomUUID()}@fixly.test`,
  password: hash, passwordByteLimit: 72, ...extra });
const auth = (u) => ({ Authorization: `Bearer ${generateToken(u)}` });
const activeAdmins = () => User.countDocuments({ role: "admin", isDeleted: { $ne: true } });

describe("last-admin guard", () => {
  it("refuses demote, soft-delete and delete of the only active admin, and allows them with a second admin", async () => {
    await User.deleteMany({});
    const first = await mk({ role: "admin" });
    const attempts = [
      () => request(app).patch(`/api/v1/admin/user/${first.id}`).set(auth(first)).send({ role: "house_owner" }),
      () => request(app).patch(`/api/v1/admin/user/${first.id}/soft-delete`).set(auth(first)),
      () => request(app).delete(`/api/v1/admin/user/${first.id}`).set(auth(first)),
    ];
    for (const attempt of attempts) {
      const res = await attempt();
      assert.equal(res.status, 409);
      assert.equal(res.body.code, "LAST_ADMIN");
    }
    assert.equal(await activeAdmins(), 1);
    assert.equal(await Lock.countDocuments(), 0);
    // A soft-deleted second admin does not count as active.
    await mk({ role: "admin", isDeleted: true });
    await request(app).patch(`/api/v1/admin/user/${first.id}`).set(auth(first)).send({ role: "house_owner" }).expect(409);
    const second = await mk({ role: "admin" });
    await request(app).patch(`/api/v1/admin/user/${second.id}`).set(auth(first)).send({ role: "house_owner" }).expect(200);
    assert.equal(await activeAdmins(), 1);
    // Non-admin accounts and promotions are unaffected.
    await request(app).patch(`/api/v1/admin/user/${second.id}`).set(auth(first)).send({ firstName: "Z" }).expect(200);
    await request(app).delete(`/api/v1/admin/user/${second.id}`).set(auth(first)).expect(200);
  });

  it("refuses self-deletion by the last active admin, allows it with a second admin", async () => {
    await User.deleteMany({});
    const only = await mk({ role: "admin" });
    const res = await request(app).delete("/api/v1/users/me").set(auth(only)).send({ password: "StrongPass123" });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "LAST_ADMIN");
    assert.equal(await activeAdmins(), 1);
    await mk({ role: "admin" });
    await request(app).delete("/api/v1/users/me").set(auth(only)).send({ password: "StrongPass123" }).expect(200);
    assert.equal(await activeAdmins(), 1);
    assert.equal(await Lock.countDocuments(), 0);
  });

  it("two admins acting on each other concurrently never leave zero active admins", async () => {
    await User.deleteMany({});
    const a = await mk({ role: "admin" });
    const b = await mk({ role: "admin" });
    const results = await Promise.all([
      request(app).patch(`/api/v1/admin/user/${b.id}/soft-delete`).set(auth(a)),
      request(app).patch(`/api/v1/admin/user/${a.id}/soft-delete`).set(auth(b)),
    ]);
    assert.ok(await activeAdmins() >= 1);
    assert.ok(results.some((r) => r.status === 200 || r.body.code === "LAST_ADMIN" || r.status === 409));
    assert.equal(await Lock.countDocuments(), 0);
  });
});

describe("logout-all and token lifetime", () => {
  it("default token lifetime is 12 hours", async () => {
    delete process.env.JWT_EXPIRES_IN; // a local .env may override the default
    const user = await mk();
    const decoded = jwt.decode(generateToken(user));
    assert.equal(decoded.exp - decoded.iat, 43200);
  });

  it("revokes the old token and pending credential tokens", async () => {
    credentialIpLimit.resetKey("127.0.0.1");
    const user = await mk();
    const old = auth(user);
    await User.updateOne({ _id: user._id }, { $set: {
      passwordReset: { hash: "a", expiresAt: new Date(Date.now() + 60000), authVersion: 0, email: user.email },
      emailChange: { hash: "b", expiresAt: new Date(Date.now() + 60000), authVersion: 0, email: "x@fixly.test" } } });
    await request(app).post("/api/v1/auth/logout-all").expect(401);
    await request(app).post("/api/v1/auth/logout-all").set(old).send({}).expect(200);
    const stored = await User.findById(user._id).select("+authVersion +passwordReset +emailChange");
    assert.equal(stored.authVersion, 1);
    assert.equal(stored.passwordReset, undefined);
    assert.equal(stored.emailChange, undefined);
    await request(app).get("/api/v1/users/me").set(old).expect(401);
    await request(app).post("/api/v1/auth/logout-all").set(old).send({}).expect(401);
    const fresh = auth(await User.findById(user._id).select("+authVersion"));
    await request(app).get("/api/v1/users/me").set(fresh).expect(200);
    assert.equal(await Lock.countDocuments(), 0);
  });
});
