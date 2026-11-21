import dotenv from "dotenv";
import { randomUUID, createHash } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-credentials-only-test-key";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
process.env.SMTP_HOST = "sandbox.smtp.mailtrap.io";
process.env.SMTP_PORT = "2525";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASSWORD = "test-password";
process.env.MAIL_FROM = "Fixly <noreply@fixly.test>";
process.env.PASSWORD_RESET_URL = "https://fixly.test/reset-password";
process.env.EMAIL_CHANGE_URL = "https://fixly.test/confirm-email-change";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const { credentialMail, actionUrl, mailSettings } = await import("../src/services/credentialMail.js");
const deliver = credentialMail.send.bind(credentialMail);
const credentials = await import("../src/services/credentials.js");
const { credentialIpLimit } = await import("../src/middleware/credentialLimits.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Lock.init()]);
const password = "StrongPass123";
const newPassword = "DifferentPass456";
const hash = await bcrypt.hash(password, 4);
const user = (extra = {}) => User.create({ firstName: "Credential", lastName: "Tester",
  email: `${randomUUID()}@fixly.test`, password: hash, passwordByteLimit: 72, ...extra });
const auth = (actor) => ({ Authorization: `Bearer ${generateToken(actor)}` });
const sent = [];
beforeEach((t) => {
  sent.length = 0;
  t.mock.method(credentialMail, "send", async (message) => { sent.push(message); });
  credentialIpLimit.resetKey("127.0.0.1");
});
const forgot = (email) => request(app).post("/api/v1/auth/forgot-password").send({ email });
const reset = (token, secret = newPassword) => request(app).post("/api/v1/auth/reset-password").send({ token, password: secret });
const pending = (id) => User.findById(id).select("+passwordReset +emailChange +authVersion +passwordByteLimit");

describe("account credential recovery", () => {
  it("returns the same forgot response for active, missing, and deactivated accounts without returning secrets", async () => {
    const active = await user(); const deleted = await user({ isDeleted: true });
    const result = await forgot(active.email).expect(200);
    assert.deepEqual(result.body, (await forgot(`${randomUUID()}@fixly.test`).expect(200)).body);
    assert.deepEqual(result.body, (await forgot(deleted.email).expect(200)).body);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, active.email);
    assert.equal(sent[0].purpose, "passwordReset");
    const stored = await pending(active.id);
    assert.equal(stored.passwordReset.hash, createHash("sha256").update(sent[0].token).digest("hex"));
    assert.equal(JSON.stringify(result.body).includes(sent[0].token), false);
    assert.equal(JSON.stringify(stored).includes(stored.passwordReset.hash), false);
    assert.equal((await User.findById(active.id)).passwordReset, undefined);
  });

  it("consumes reset once, replaces password, clears pending email and revokes old sessions", async () => {
    const actor = await user(); const oldAuth = auth(actor);
    await credentials.requestEmailChange(actor, { currentPassword: password, email: `${randomUUID()}@fixly.test` });
    await forgot(actor.email).expect(200);
    const token = sent.at(-1).token;
    await reset(token).expect(200);
    await reset(token).expect(400);
    await request(app).get("/api/v1/users/me").set(oldAuth).expect(401);
    await request(app).post("/api/v1/auth/login").send({ email: actor.email, password }).expect(401);
    await request(app).post("/api/v1/auth/login").send({ email: actor.email, password: newPassword }).expect(200);
    const stored = await pending(actor.id);
    assert.equal(stored.passwordReset, undefined);
    assert.equal(stored.emailChange, undefined);
    assert.equal(stored.passwordByteLimit, 72);
    assert.equal(stored.authVersion, 1);
  });

  it("rejects expired, superseded, wrong-purpose and deactivated account reset tokens", async () => {
    const actor = await user();
    await credentials.forgotPassword({ email: actor.email });
    const old = sent.at(-1).token;
    await credentials.forgotPassword({ email: actor.email });
    const latest = sent.at(-1).token;
    await assert.rejects(credentials.resetPassword({ token: old, password: newPassword }), { statusCode: 400 });
    await assert.rejects(credentials.confirmEmailChange({ token: latest }), { statusCode: 400 });
    await User.updateOne({ _id: actor.id }, { $set: { "passwordReset.expiresAt": new Date(0) } });
    await assert.rejects(credentials.resetPassword({ token: latest, password: newPassword }), { statusCode: 400 });
    await credentials.forgotPassword({ email: actor.email });
    await User.updateOne({ _id: actor.id }, { $set: { isDeleted: true } });
    await assert.rejects(credentials.resetPassword({ token: sent.at(-1).token, password: newPassword }), { statusCode: 400 });
  });

  it("binds links to the issuing session generation and requires single winning concurrent consume", async () => {
    const actor = await user();
    await credentials.forgotPassword({ email: actor.email });
    const old = sent.at(-1).token;
    await User.updateOne({ _id: actor.id }, { $inc: { authVersion: 1 } });
    await assert.rejects(credentials.resetPassword({ token: old, password: newPassword }), { statusCode: 400 });
    await credentials.forgotPassword({ email: actor.email });
    const token = sent.at(-1).token;
    const results = await Promise.allSettled([credentials.resetPassword({ token, password: newPassword }), credentials.resetPassword({ token, password: newPassword })]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal((await pending(actor.id)).authVersion, 2);
    assert.equal(await Lock.countDocuments({ _id: actor.id }), 0);
  });

  it("checks mail configuration for every address and suppresses provider failures without keeping undelivered tokens", async (t) => {
    const actor = await user();
    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      await forgot(actor.email).expect(503);
      await forgot(`${randomUUID()}@fixly.test`).expect(503);
    } finally { process.env.SMTP_HOST = host; }
    t.mock.method(credentialMail, "send", async () => { throw new Error("private provider credential"); });
    const result = await forgot(actor.email).expect(200);
    assert.equal(JSON.stringify(result.body).includes("private"), false);
    assert.equal((await pending(actor.id)).passwordReset, undefined);
  });

  it("validates new password strength, UTF-8 length and strict request fields", async () => {
    const actor = await user();
    await forgot(actor.email).expect(200);
    const token = sent.at(-1).token;
    for (const secret of ["weak", "a".repeat(80) + "A1", "É".repeat(36) + "aA1"]) await reset(token, secret).expect(400);
    await request(app).post("/api/v1/auth/reset-password").send({ token, password: newPassword, role: "admin" }).expect(400);
    await request(app).post("/api/v1/auth/forgot-password").send({ email: actor.email, token }).expect(400);
    assert.ok((await pending(actor.id)).passwordReset);
  });

  it("never echoes invalid passwords or reset tokens in validation responses", async () => {
    const invalidToken = "PRIVATE_TOKEN_should_not_echo";
    const invalidPassword = "PRIVATE_PASSWORD_123";
    const response = await request(app).post("/api/v1/auth/reset-password")
      .send({ token: invalidToken, password: invalidPassword }).expect(400);
    assert.equal(JSON.stringify(response.body).includes(invalidToken), false);
    assert.equal(JSON.stringify(response.body).includes(invalidPassword), false);
    const actor = await user();
    const change = await request(app).patch("/api/v1/users/me/password").set(auth(actor))
      .send({ currentPassword: password, password: invalidPassword }).expect(400);
    assert.equal(JSON.stringify(change.body).includes(invalidPassword), false);
  });

  it("password changes require a fresh session and current password, revoke sessions and clear recovery links", async () => {
    const actor = await user(); const session = auth(actor);
    await credentials.forgotPassword({ email: actor.email });
    await request(app).patch("/api/v1/users/me/password").send({ currentPassword: password, password: newPassword }).expect(401);
    await request(app).patch("/api/v1/users/me/password").set(session).send({ currentPassword: "wrong", password: newPassword }).expect(401);
    await request(app).patch("/api/v1/users/me/password").set(session).send({ currentPassword: password, password: newPassword }).expect(200);
    await request(app).get("/api/v1/users/me").set(session).expect(401);
    await assert.rejects(credentials.changePassword(actor, { currentPassword: newPassword, password }), { statusCode: 401 });
    assert.equal((await pending(actor.id)).passwordReset, undefined);
  });

  it("requires mailbox reset for legacy bcrypt accounts and then records a bounded replacement", async () => {
    const legacyPassword = "X".repeat(72) + "suffixa1";
    const actor = await user({ password: await bcrypt.hash(legacyPassword, 4), passwordByteLimit: undefined });
    await request(app).post("/api/v1/auth/login").send({ email: actor.email, password: legacyPassword }).expect(200);
    await assert.rejects(credentials.changePassword(actor, { currentPassword: legacyPassword, password: newPassword }), { statusCode: 409 });
    await assert.rejects(credentials.requestEmailChange(actor, { currentPassword: "X".repeat(72), email: `${randomUUID()}@fixly.test` }), { statusCode: 409 });
    await credentials.forgotPassword({ email: actor.email });
    await credentials.resetPassword({ token: sent.at(-1).token, password: newPassword });
    assert.equal((await pending(actor.id)).passwordByteLimit, 72);
    await request(app).post("/api/v1/auth/login").send({ email: actor.email, password: newPassword }).expect(200);
  });

  it("only changes email after verification at the new address and revokes sessions and tokens", async () => {
    const actor = await user(); const session = auth(actor); const target = `${randomUUID()}@fixly.test`;
    await credentials.forgotPassword({ email: actor.email });
    await request(app).post("/api/v1/users/me/email-change").set(session).send({ currentPassword: password, email: target }).expect(200);
    assert.equal(sent.at(-1).to, target);
    assert.equal((await User.findById(actor.id)).email, actor.email);
    const token = sent.at(-1).token;
    await reset(token).expect(400);
    await request(app).post("/api/v1/auth/confirm-email-change").send({ token }).expect(200);
    await request(app).post("/api/v1/auth/confirm-email-change").send({ token }).expect(400);
    await request(app).get("/api/v1/users/me").set(session).expect(401);
    assert.equal((await pending(actor.id)).passwordReset, undefined);
    assert.equal((await User.findById(actor.id)).email, target);
  });

  it("handles occupied addresses at initiation and at confirmation without losing the pending change", async () => {
    const actor = await user(); const occupied = await user();
    await assert.rejects(credentials.requestEmailChange(actor, { currentPassword: "wrong", email: occupied.email }), { statusCode: 401 });
    await assert.rejects(credentials.requestEmailChange(actor, { currentPassword: password, email: occupied.email }), { statusCode: 409 });
    const target = `${randomUUID()}@fixly.test`;
    await credentials.requestEmailChange(actor, { currentPassword: password, email: target });
    const token = sent.at(-1).token;
    await user({ email: target });
    await assert.rejects(credentials.confirmEmailChange({ token }), { statusCode: 409 });
    assert.ok((await pending(actor.id)).emailChange);
    assert.equal((await User.findById(actor.id)).email, actor.email);
  });

  it("refuses stale authenticated callers after deactivation and cleans undelivered email-change links", async (t) => {
    const actor = await user();
    await User.updateOne({ _id: actor.id }, { $set: { isDeleted: true } });
    await assert.rejects(credentials.changePassword(actor, { currentPassword: password, password: newPassword }), { statusCode: 401 });
    const active = await user();
    t.mock.method(credentialMail, "send", async () => { throw Object.assign(new Error("Mail unavailable"), { statusCode: 503 }); });
    await assert.rejects(credentials.requestEmailChange(active, { currentPassword: password, email: `${randomUUID()}@fixly.test` }), { statusCode: 503 });
    assert.equal((await pending(active.id)).emailChange, undefined);
  });

  it("limits repeated recovery requests for an address without sending extra mail", async () => {
    const actor = await user();
    for (let count = 0; count < 5; count++) await forgot(actor.email).expect(200);
    await forgot(actor.email).expect(429);
    assert.equal(sent.length, 5);
  });

  it("uses only configured trusted URLs and requires TLS for Mailtrap", () => {
    assert.equal(mailSettings().transport.requireTLS, true);
    const original = process.env.PASSWORD_RESET_URL;
    try {
      for (const value of ["https://user:secret@fixly.test/reset", "https://fixly.test/reset?redirect=evil", "https://fixly.test/#fragment", "http://evil.test/reset"]) {
        process.env.PASSWORD_RESET_URL = value;
        assert.throws(() => actionUrl("passwordReset"), { statusCode: 503 });
      }
    } finally { process.env.PASSWORD_RESET_URL = original; }
  });

  it("delivers a fragment-token action link through SMTP and sanitizes transport errors", async (t) => {
    let outgoing; let options; let closed = false;
    t.mock.method(nodemailer, "createTransport", (settings) => {
      options = settings;
      return { sendMail: async (message) => { outgoing = message; return { accepted: [message.to] }; }, close: () => { closed = true; } };
    });
    const token = "a".repeat(64);
    await deliver({ to: "owner@fixly.test", purpose: "passwordReset", token });
    assert.equal(options.host, "sandbox.smtp.mailtrap.io");
    assert.equal(options.port, 2525);
    assert.equal(options.requireTLS, true);
    assert.equal(options.disableUrlAccess, true);
    assert.equal(closed, true);
    assert.equal(outgoing.to, "owner@fixly.test");
    assert.ok(outgoing.text.includes(`https://fixly.test/reset-password#token=${token}`));
    assert.equal(outgoing.text.includes(process.env.SMTP_PASSWORD), false);
    t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => { throw new Error("private-smtp-password"); }, close: () => {} }));
    await assert.rejects(deliver({ to: "owner@fixly.test", purpose: "emailChange", token }),
      (error) => error.statusCode === 503 && !error.message.includes("private-smtp-password"));
  });
});
