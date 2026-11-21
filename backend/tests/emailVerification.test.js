import dotenv from "dotenv";
import { randomUUID, createHash } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-email-verification-test-key";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
process.env.SMTP_HOST = "sandbox.smtp.mailtrap.io";
process.env.SMTP_PORT = "2525";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASSWORD = "test-password";
process.env.MAIL_FROM = "Fixly <noreply@fixly.test>";
process.env.PASSWORD_RESET_URL = "https://fixly.test/reset-password";
process.env.EMAIL_CHANGE_URL = "https://fixly.test/confirm-email-change";
process.env.EMAIL_VERIFY_URL = "https://fixly.test/verify-email";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const { credentialMail } = await import("../src/services/credentialMail.js");
const { flushPendingMail, EMAIL_VERIFICATION_TOKEN_MINUTES, CREDENTIAL_TOKEN_MINUTES } = await import("../src/services/credentials.js");
const { credentialIpLimit } = await import("../src/middleware/credentialLimits.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init(), Lock.init()]);

const password = "StrongPass123";
const sent = [];
beforeEach((t) => {
  sent.length = 0;
  t.mock.method(credentialMail, "send", async (message) => { sent.push(message); });
  credentialIpLimit.resetKey("::ffff:127.0.0.1");
  credentialIpLimit.resetKey("127.0.0.1");
});
const hour = 3600000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const auth = (actor) => ({ Authorization: `Bearer ${generateToken(actor)}` });
const register = (role = "house_owner") => request(app).post("/api/v1/auth/register").send({
  firstName: "Verify", lastName: "Tester", email: `${randomUUID()}@fixly.test`, password, role });
const signUp = async (role) => {
  const res = await register(role).expect(201);
  await flushPendingMail();
  return { res, id: res.body.data.id, email: res.body.data.email, token: sent.at(-1)?.token };
};
const legacy = (role = "house_owner") => User.create({ firstName: "Legacy", lastName: "User", email: `${randomUUID()}@fixly.test`,
  password: "unused-test-password", role });
const profile = (user, extra = {}) => Profile.create({ user_id: user.id, professional_headline: "Experienced plumber", profession: "Plumber",
  experience_years: 3, phone_number: "08012345678", starting_price: 5000, residential_address: "Home", office_address: "Office", ...extra });
const verify = (token) => request(app).post("/api/v1/auth/verify-email").send({ token });
const bookingBody = (artisan) => ({ artisan: artisan.id, description: "Repair the leaking kitchen tap", serviceAddress: "12 Example Street",
  inspectionWindow: { start: iso(24 * hour), end: iso(25 * hour) }, responseDeadline: iso(hour) });

describe("email verification at registration", () => {
  it("registers unverified, mails a 24h link in the background and stores only a hash", async () => {
    const { res, id, token } = await signUp();
    assert.equal(res.body.data.emailVerified, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].purpose, "emailVerification");
    assert.match(token, /^[a-f0-9]{64}$/);
    const stored = await User.findById(id).select("+emailVerification");
    assert.equal(stored.emailVerification.hash, createHash("sha256").update(token).digest("hex"));
    assert.notEqual(stored.emailVerification.hash, token);
    const lifetime = stored.emailVerification.expiresAt - Date.now();
    assert.ok(Math.abs(lifetime - EMAIL_VERIFICATION_TOKEN_MINUTES * 60000) < 60000);
    assert.equal(EMAIL_VERIFICATION_TOKEN_MINUTES, 1440);
    assert.equal(CREDENTIAL_TOKEN_MINUTES, 30);
    assert.ok(!JSON.stringify(res.body).includes(token));
  });

  it("still registers when mail delivery fails and clears the dead token", async (t) => {
    t.mock.method(credentialMail, "send", async () => { throw new Error("smtp down"); });
    t.mock.method(console, "error", () => {});
    const res = await register().expect(201);
    await flushPendingMail();
    const stored = await User.findById(res.body.data.id).select("+emailVerification");
    assert.equal(stored.emailVerified, false);
    assert.equal(stored.emailVerification, undefined);
  });

  it("verifies once; the token cannot be replayed and sessions stay valid", async () => {
    const { id, token } = await signUp();
    const before = await User.findById(id).select("+authVersion");
    await verify(token).expect(200);
    const after = await User.findById(id).select("+authVersion +emailVerification");
    assert.equal(after.emailVerified, true);
    assert.equal(after.emailVerification, undefined);
    assert.equal(after.authVersion, before.authVersion);
    await request(app).get("/api/v1/users/me").set(auth(after)).expect(200).expect((r) => assert.equal(r.body.data.emailVerified, true));
    await verify(token).expect(400);
  });

  it("rejects unknown, malformed, expired and other-purpose tokens", async () => {
    const { id, token } = await signUp();
    await verify("a".repeat(64)).expect(400);
    await verify("not-a-token").expect(400);
    await request(app).post("/api/v1/auth/verify-email").send({ token, extra: 1 }).expect(400);
    await User.updateOne({ _id: id }, { $set: { "emailVerification.expiresAt": new Date(Date.now() - 1000) } });
    await verify(token).expect(400);
    assert.equal((await User.findById(id)).emailVerified, false);
    const resetTokenUser = await signUp();
    await request(app).post("/api/v1/auth/reset-password").send({ token: resetTokenUser.token, password: "DifferentPass456" }).expect(400);
  });

  it("rejects a verification token after the address changed", async () => {
    const { id, token } = await signUp();
    await User.updateOne({ _id: id }, { email: `${randomUUID()}@fixly.test` });
    await verify(token).expect(400);
  });

  it("marks the address verified when a verified email change is confirmed", async () => {
    const { id, token } = await signUp();
    const user = await User.findById(id).select("+authVersion");
    const email = `${randomUUID()}@fixly.test`;
    const { createHash: h } = await import("node:crypto");
    const changeToken = "c".repeat(64);
    await User.updateOne({ _id: id }, { emailChange: { hash: h("sha256").update(changeToken).digest("hex"),
      expiresAt: new Date(Date.now() + hour), authVersion: user.authVersion || 0, email } });
    await request(app).post("/api/v1/auth/confirm-email-change").send({ token: changeToken }).expect(200);
    const changed = await User.findById(id);
    assert.equal(changed.email, email);
    assert.equal(changed.emailVerified, true);
    await verify(token).expect(400);
  });

  it("resend replaces the old token, is a no-op when verified and requires auth", async () => {
    const { id, token: first } = await signUp();
    const actor = await User.findById(id).select("+authVersion");
    await request(app).post("/api/v1/auth/resend-verification").expect(401);
    await request(app).post("/api/v1/auth/resend-verification").set(auth(actor)).expect(200);
    await flushPendingMail();
    assert.equal(sent.length, 2);
    const second = sent.at(-1).token;
    assert.notEqual(second, first);
    await verify(first).expect(400);
    await verify(second).expect(200);
    await request(app).post("/api/v1/auth/resend-verification").set(auth(actor)).expect(200);
    await flushPendingMail();
    assert.equal(sent.length, 2);
  });

  it("rate limits resend per account", async () => {
    const { id } = await signUp();
    const actor = await User.findById(id).select("+authVersion");
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await request(app).post("/api/v1/auth/resend-verification").set(auth(actor))).status);
    assert.equal(statuses.at(-1), 429);
    assert.equal(statuses[0], 200);
  });

  it("lets unverified users log in but blocks creating service requests with EMAIL_NOT_VERIFIED", async () => {
    const owner = await signUp();
    const login = await request(app).post("/api/v1/auth/login").send({ email: owner.email, password }).expect(200);
    assert.equal(login.body.data.emailVerified, false);
    const artisan = await legacy("artisan"); await profile(artisan);
    const res = await request(app).post("/api/v1/service-requests").set({ Authorization: `Bearer ${login.body.data.token}` })
      .send(bookingBody(artisan)).expect(403);
    assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");
    await verify(owner.token).expect(200);
    await request(app).post("/api/v1/service-requests").set({ Authorization: `Bearer ${login.body.data.token}` })
      .send(bookingBody(artisan)).expect(201);
  });

  it("grandfathers legacy accounts with no emailVerified field", async () => {
    const owner = await legacy();
    assert.equal((await User.collection.findOne({ _id: owner._id })).emailVerified, undefined);
    const artisan = await legacy("artisan"); await profile(artisan);
    await request(app).post("/api/v1/service-requests").set(auth(owner)).send(bookingBody(artisan)).expect(201);
    const login = await request(app).post("/api/v1/auth/login").send({ email: owner.email, password: "unused-test-password" });
    assert.notEqual(login.body.data?.emailVerified, false);
    const list = await request(app).get("/api/v1/artisan/profiles?limit=100").expect(200);
    assert.ok(list.body.data.some((p) => p.user_id.id === artisan.id));
  });

  it("hides unverified artisans from the directory and by id, except to the owner and admins", async () => {
    const hidden = await signUp("artisan"); const shown = await legacy("artisan"); const admin = await legacy("admin");
    const hiddenProfile = await profile({ id: hidden.id }); const shownProfile = await profile(shown);
    const list = await request(app).get("/api/v1/artisan/profiles?limit=100").expect(200);
    assert.ok(!list.body.data.some((p) => p.id === hiddenProfile.id));
    assert.ok(list.body.data.some((p) => p.id === shownProfile.id));
    assert.equal(list.body.meta.total, list.body.data.length);
    await request(app).get(`/api/v1/artisan/profile/${hiddenProfile.id}`).expect(404);
    const stranger = await legacy();
    await request(app).get(`/api/v1/artisan/profile/${hiddenProfile.id}`).set(auth(stranger)).expect(404);
    const owner = await User.findById(hidden.id).select("+authVersion");
    const own = await request(app).get(`/api/v1/artisan/profile/${hiddenProfile.id}`).set(auth(owner)).expect(200);
    assert.equal(own.body.data.user_id.emailVerified, undefined);
    await request(app).get(`/api/v1/artisan/profile/${hiddenProfile.id}`).set(auth(admin)).expect(200);
    await request(app).get(`/api/v1/artisan/profile/${shownProfile.id}`).expect(200);
    await verify(hidden.token).expect(200);
    await request(app).get(`/api/v1/artisan/profile/${hiddenProfile.id}`).expect(200);
  });

  it("blocks booking by id for unverified, soft-deleted and unavailable artisans with ARTISAN_UNAVAILABLE", async () => {
    const owner = await legacy();
    const book = (artisan) => request(app).post("/api/v1/service-requests").set(auth(owner)).send(bookingBody(artisan));
    const unverified = await legacy("artisan"); await profile(unverified);
    await User.updateOne({ _id: unverified.id }, { emailVerified: false });
    const deleted = await legacy("artisan"); await profile(deleted); await User.updateOne({ _id: deleted.id }, { isDeleted: true });
    const away = await legacy("artisan"); await profile(away, { isAvailable: false });
    for (const artisan of [unverified, deleted, away]) {
      const res = await book(artisan).expect(409);
      assert.equal(res.body.code, "ARTISAN_UNAVAILABLE");
    }
    await User.updateOne({ _id: unverified.id }, { emailVerified: true });
    await book(unverified).expect(201);
    // Unknown ids keep the existing validation error.
    await book({ id: new mongoose.Types.ObjectId().toString() }).expect(400);
  });

  it("never returns verification tokens from account endpoints", async () => {
    const { id } = await signUp();
    const user = await User.findById(id).select("+authVersion +emailVerification");
    const me = await request(app).get("/api/v1/users/me").set(auth(user)).expect(200);
    assert.ok(!JSON.stringify(me.body).includes("emailVerification"));
    assert.ok(!JSON.stringify(user.toJSON()).includes(user.emailVerification.hash));
  });
});
