import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-account-recovery-test-secret";
process.env.API_RATE_LIMIT_MAX = "1000";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.SOFT_DELETE_GRACE_DAYS = "30";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init(), Lock.init()]);
const password = "StrongPass123";
const hash = await bcrypt.hash(password, 4);
const createUser = (fields = {}) => User.create({
  firstName: "Returning", lastName: "Owner", email: `${randomUUID()}@fixly.test`,
  password: hash, passwordByteLimit: 72, ...fields,
});
const auth = (user) => ({ Authorization: `Bearer ${generateToken(user)}` });
const restart = (user, previousPassword) => request(app).post("/api/v1/auth/register").send({
  firstName: "Fresh", lastName: "Start", email: user.email, password: "DifferentPass456", previousPassword,
});
const reactivate = (user, secret = password) => request(app).post("/api/v1/auth/reactivate")
  .send({ email: user.email, password: secret });
const expired = { isDeleted: true, deletionReason: "self", deletedAt: new Date(Date.now() - 31 * 86_400_000) };

describe("credential-verified account recovery", () => {
  it("requires authentication and current-password confirmation for self deletion", async () => {
    const user = await createUser();
    await request(app).delete("/api/v1/users/me").send({ password }).expect(401);
    await request(app).delete("/api/v1/users/me").set(auth(user)).send({ password: "wrong" }).expect(401);
    assert.equal((await User.findById(user.id)).isDeleted, false);
    await request(app).delete("/api/v1/users/me").set(auth(user)).send({ password }).expect(200);
    const deleted = await User.findById(user.id).select("+deletionReason +lifecycleAction");
    assert.equal(deleted.deletionReason, "self");
    assert.equal(deleted.lifecycleAction, null);
    await request(app).post("/api/v1/auth/login").send({ email: user.email, password }).expect(401);
  });

  it("explicitly restores a self-deleted artisan and keeps old sessions revoked", async () => {
    const user = await createUser({ role: "artisan" });
    const profile = await Profile.create({
      user_id: user._id, professional_headline: "An experienced plumber", profession: "Plumber",
      experience_years: 4, phone_number: "08012345678", starting_price: 5000,
      residential_address: "Private home address", office_address: "Private office address",
    });
    const oldSession = auth(user);
    await request(app).delete("/api/v1/users/me").set(oldSession).send({ password }).expect(200);
    await reactivate(user, "wrong").expect(401);
    assert.equal((await User.findById(user.id)).isDeleted, true);
    await reactivate(user).expect(200);
    assert.equal((await Profile.findById(profile.id)).isDeleted, false);
    assert.equal((await User.findById(user.id)).role, "artisan");
    await request(app).get("/api/v1/users/me").set(oldSession).expect(401);
    const login = await request(app).post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
    const personal = await request(app).get("/api/v1/users/me")
      .set({ Authorization: `Bearer ${login.body.data.token}` }).expect(200);
    for (const field of ["deletionReason", "lifecycleAction", "authVersion", "avatarCleanupClaim"]) {
      assert.equal(personal.body.data[field], undefined);
    }
  });

  it("reserves the email during grace and reveals options only with ownership proof", async () => {
    const user = await createUser({ isDeleted: true, deletionReason: "self", deletedAt: new Date() });
    const unproven = await restart(user).expect(409);
    assert.equal(unproven.body.data, undefined);
    const proven = await restart(user, password).expect(409);
    assert.equal(proven.body.data.isDeactivated, true);
    assert.ok(proven.body.data.daysRemaining > 0);
    assert.equal((await User.findById(user.id)).isDeleted, true);
  });

  it("refuses unauthenticated or incorrect-password erasure after grace", async () => {
    const user = await createUser(expired);
    await restart(user).expect(409);
    await restart(user, "wrong").expect(409);
    assert.ok(await User.findById(user.id));
    await reactivate(user).expect(401);
    assert.equal((await User.findById(user.id)).isDeleted, true);
  });

  it("creates a fresh identity after grace with no profile or role inheritance", async () => {
    const user = await createUser({ ...expired, role: "artisan" });
    const profile = await Profile.create({
      user_id: user._id, professional_headline: "An experienced plumber", profession: "Plumber",
      experience_years: 4, phone_number: "08012345678", starting_price: 5000,
      residential_address: "Private home address", office_address: "Private office address", isDeleted: true,
    });
    const fresh = await restart(user, password).expect(201);
    assert.notEqual(fresh.body.data.id, user.id);
    assert.equal(fresh.body.data.role, "house_owner");
    assert.equal(await User.findById(user.id), null);
    assert.equal(await Profile.findById(profile.id), null);
    assert.equal(await User.countDocuments({ email: user.email }), 1);
  });

  it("never bypasses administrative or legacy deactivation with old credentials", async () => {
    for (const deletionReason of ["admin", null]) {
      const user = await createUser({ ...expired, deletionReason });
      await restart(user, password).expect(409);
      await reactivate(user).expect(401);
      assert.ok(await User.findById(user.id));
    }
    const unknownDate = await createUser({ isDeleted: true, deletionReason: "self" });
    await restart(unknownDate, password).expect(409);
    await reactivate(unknownDate).expect(401);
  });

  it("rechecks grace and deletion state after a concurrent administrator restores the account", async (t) => {
    const user = await createUser(expired);
    const admin = await createUser({ role: "admin" });
    let entered;
    let release;
    const paused = new Promise((resolve) => { entered = resolve; });
    const resume = new Promise((resolve) => { release = resolve; });
    const original = User.findOne.bind(User);
    let held = false;
    t.mock.method(User, "findOne", (...args) => {
      const query = original(...args);
      if (!held && args[0]?.email === user.email) {
        held = true;
        const exec = query.exec.bind(query);
        query.exec = async (...execArgs) => {
          const found = await exec(...execArgs);
          entered();
          await resume;
          return found;
        };
      }
      return query;
    });
    const pending = restart(user, password).then((res) => res);
    try {
      await paused;
      await request(app).patch(`/api/v1/admin/user/${user.id}/restore`).set(auth(admin)).expect(200);
    } finally {
      release();
    }
    assert.equal((await pending).status, 409);
    assert.equal((await User.findById(user.id)).isDeleted, false);
  });

  it("restarts successfully when an earlier permanent deletion is still pending", async () => {
    const user = await createUser({ ...expired, lifecycleAction: "delete" });
    const fresh = await restart(user, password).expect(201);
    assert.notEqual(fresh.body.data.id, user.id);
    assert.equal(await User.findById(user.id), null);
    assert.equal(await User.countDocuments({ email: user.email }), 1);
  });

  it("keeps old sessions invalid after an administrator deactivates and restores an account", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "admin" });
    const oldSession = auth(user);
    await request(app).patch(`/api/v1/admin/user/${user.id}/soft-delete`).set(auth(admin)).expect(200);
    await request(app).patch(`/api/v1/admin/user/${user.id}/restore`).set(auth(admin)).expect(200);
    await request(app).get("/api/v1/users/me").set(oldSession).expect(401);
    const login = await request(app).post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
    await request(app).get("/api/v1/users/me")
      .set({ Authorization: `Bearer ${login.body.data.token}` }).expect(200);
  });

  it("treats an administrator repeating self-deactivation as an administrative restriction", async () => {
    const user = await createUser({ isDeleted: true, deletionReason: "self", deletedAt: new Date() });
    const admin = await createUser({ role: "admin" });
    await request(app).patch(`/api/v1/admin/user/${user.id}/soft-delete`).set(auth(admin)).expect(200);
    await reactivate(user).expect(401);
    assert.equal((await User.findById(user.id).select("+deletionReason")).deletionReason, "admin");
  });
});
