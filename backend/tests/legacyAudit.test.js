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
process.env.JWT_SECRET = "fixly-audit-test-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { generateToken } = await import("../src/utils/jwt.js");
const audit = await import("../scripts/legacy-data-audit.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init()]);
const hash = await bcrypt.hash("StrongPass123", 4);
const mk = (extra = {}) => User.create({ firstName: "A", lastName: "B", email: `${randomUUID()}@fixly.test`,
  password: hash, passwordByteLimit: 72, ...extra });
const profileOf = (user, rating = []) => Profile.collection.insertOne({ user_id: user._id, professional_headline: "Plumber pro",
  profession: "Plumber", experience_years: 1, phone_number: "08012345678", starting_price: 1,
  residential_address: "x", office_address: "y", rating, isDeleted: false });

describe("legacy data audit", () => {
  it("guards the target database", () => {
    assert.equal(audit.assertAuditTarget("mongodb://127.0.0.1:27017/x", {}, "x"), "mongodb://127.0.0.1:27017/x");
    const remote = "mongodb+srv://u:p@cluster.example.net/prod";
    assert.throws(() => audit.assertAuditTarget(remote, {}, "prod"), /Refusing non-local/);
    assert.throws(() => audit.assertAuditTarget(remote, { remote: true }, "prod"), /Refusing/);
    assert.throws(() => audit.assertAuditTarget(remote, { remote: true, confirmDb: "other" }, "prod"), /Refusing/);
    assert.throws(() => audit.assertAuditTarget("mongodb://db.example.net/prod", { confirmDb: "prod" }, "prod"), /Refusing/);
    assert.equal(audit.assertAuditTarget(remote, { remote: true, confirmDb: "prod" }, "prod"), remote);
    assert.throws(() => audit.assertSimulationTarget("mongodb://db.example.net/x"), /non-local/);
    assert.throws(() => audit.parseArgs(["--apply", "admins"]), /--apply/);
  });

  it("dry run reports and changes nothing; apply ratings is idempotent", async () => {
    const adminUser = await mk({ role: "admin" });
    const legacy = await mk({ passwordByteLimit: undefined });
    const plain = await mk({ role: "artisan" });
    const rated = await mk({ role: "artisan" });
    await profileOf(plain);
    await profileOf(rated, [5, 4]);
    const before = JSON.stringify([await User.find().lean(), await Profile.find().lean()]);
    const { report, dryRun } = await audit.run(audit.parseArgs([]));
    assert.equal(dryRun, true);
    assert.equal(JSON.stringify([await User.find().lean(), await Profile.find().lean()]), before);
    assert.equal(report.admins.items[0].id, adminUser.id);
    assert.deepEqual(report.legacyRatings, { count: 1, ids: [(await Profile.findOne({ user_id: rated._id }))._id.toString()] });
    assert.ok(report.legacyPasswords.ids.includes(legacy.id));
    assert.equal(report.legacyPasswords.nonBcryptCount, 0);
    const text = JSON.stringify(report);
    assert.ok(!text.includes(hash) && !text.includes(legacy.email));

    const first = await audit.run(audit.parseArgs(["--apply", "ratings"]));
    assert.deepEqual(first.applied.ratings, { matched: 1, modified: 1 });
    assert.deepEqual((await audit.run(audit.parseArgs(["--apply", "ratings"]))).applied.ratings, { matched: 0, modified: 0 });
    assert.deepEqual((await Profile.findOne({ user_id: rated._id }).lean()).rating, []);
    assert.equal((await User.findById(adminUser._id)).role, "admin");
  });

  it("send-resets mails only active legacy non-admin users and prints no addresses", async () => {
    await User.deleteMany({});
    const target = await mk({ passwordByteLimit: undefined });
    await User.collection.updateOne({ _id: target._id }, { $unset: { passwordByteLimit: 1 } });
    const unset = (u) => User.collection.updateOne({ _id: u._id }, { $unset: { passwordByteLimit: 1 } });
    const legacyAdmin = await mk({ role: "admin" }); await unset(legacyAdmin);
    const legacyDeleted = await mk({ isDeleted: true }); await unset(legacyDeleted);
    await mk();
    const calls = [];
    const result = await audit.run(audit.parseArgs(["--apply", "send-resets"]), {
      forgotPassword: async ({ email }) => { calls.push(email); },
      flushPendingMail: async () => { calls.push("flush"); },
    });
    assert.deepEqual(calls, [target.email, "flush"]);
    assert.deepEqual(result.applied.sendResets, { eligible: 1, attempted: 1, failed: 0 });
    assert.ok(!JSON.stringify(result.applied).includes(target.email));
    const limited = await audit.sendResets({ batch: 1, forgotPassword: async () => {}, flushPendingMail: async () => {} });
    assert.equal(limited.eligible, 1);
  });
});

describe("profile responses hide the legacy rating array", () => {
  it("omits rating but keeps ratingSummary", async () => {
    const user = await mk({ role: "artisan" });
    const { insertedId } = await profileOf(user, [1, 1]);
    const headers = { Authorization: `Bearer ${generateToken(user)}` };
    const mine = await request(app).get("/api/v1/artisan/profile/me").set(headers);
    const list = await request(app).get("/api/v1/artisan/profiles").set(headers);
    const one = await request(app).get(`/api/v1/artisan/profile/${insertedId}`).set(headers);
    for (const res of [mine, list, one]) assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(!("rating" in mine.body.data) && "ratingSummary" in mine.body.data);
    assert.ok(!("rating" in one.body.data) && "ratingSummary" in one.body.data);
    const item = (list.body.data.profiles || list.body.data).find((p) => p.user_id.id === user.id);
    assert.ok(item && !("rating" in item) && "ratingSummary" in item);
  });
});
