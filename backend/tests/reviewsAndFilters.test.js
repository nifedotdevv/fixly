import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-review-tests-only";
process.env.API_RATE_LIMIT_MAX = "10000";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: Booking } = await import("../src/models/serviceRequest.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const { submitReview } = await import("../src/services/requests/reviews.js");
const { expiryRules } = await import("../src/services/requests/rules.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init(), Booking.init(), Lock.init()]);

const user = (role = "house_owner") => User.create({ firstName: "Review", lastName: "Tester",
  email: `${randomUUID()}@fixly.test`, password: "unused-test-password", role });
const auth = (actor) => ({ Authorization: `Bearer ${generateToken(actor)}` });
const pair = async () => {
  const homeowner = await user(); const artisan = await user("artisan");
  const profile = await Profile.create({ user_id: artisan.id, professional_headline: "Experienced plumber", profession: "Plumber",
    experience_years: 3, phone_number: "08012345678", starting_price: 5000,
    residential_address: "Private home", office_address: "Private office", rating: [1, 1, 1] });
  return { homeowner, artisan, profile };
};
const booking = (p, status = "completed", extra = {}) => Booking.create({ homeowner: p.homeowner.id,
  artisan: p.artisan.id, description: "A synthetic completed booking", serviceAddress: "Private booking address",
  inspectionWindow: { start: new Date(Date.now() + 86400000), end: new Date(Date.now() + 90000000) },
  responseDeadline: new Date(Date.now() + 3600000), status, ...extra });
const review = (job, actor, body = { rating: 5, comment: "Careful work" }) =>
  request(app).post(`/api/v1/service-requests/${job.id}/review`).set(auth(actor)).send(body);
const list = (actor, query = "") => request(app).get(`/api/v1/service-requests${query}`).set(auth(actor));

it("only the completed booking homeowner can submit one immutable review", async () => {
  const p = await pair(); const job = await booking(p);
  await request(app).post(`/api/v1/service-requests/${job.id}/review`).send({ rating: 5 }).expect(401);
  await review(job, await user()).expect(404);
  await review(job, await user("admin")).expect(404);
  await review(job, p.artisan).expect(403);
  const response = await review(job, p.homeowner).expect(201);
  assert.equal(response.body.data.review.rating, 5);
  assert.equal(response.body.data.review.comment, "Careful work");
  await review(job, p.homeowner, { rating: 1 }).expect(409);
  assert.equal((await Booking.findById(job.id)).review.rating, 5);
  const detail = await request(app).get(`/api/v1/service-requests/${job.id}`).set(auth(p.homeowner)).expect(200);
  assert.equal(detail.body.data.review.rating, 5);
});

it("rejects reviews before completion and invalid or spoofed review fields", async () => {
  const p = await pair();
  for (const status of ["pending", "awaiting_final_payment", "problem_reported", "support_closed"]) {
    await review(await booking(p, status), p.homeowner).expect(409);
  }
  const job = await booking(p);
  for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: "5" }, {},
    { rating: 5, homeowner: p.homeowner.id }, { rating: 5, createdAt: new Date() },
    { rating: 5, comment: "x".repeat(2001) }]) await review(job, p.homeowner, body).expect(400);
  await review(job, p.homeowner, { rating: 4 }).expect(201);
});

it("concurrent reviews have one winner without double counting", async () => {
  const p = await pair(); const job = await booking(p);
  const results = await Promise.all([review(job, p.homeowner), review(job, p.homeowner)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const response = await request(app).get(`/api/v1/artisan/profile/${p.profile.id}`).expect(200);
  assert.deepEqual(response.body.data.ratingSummary, { count: 1, average: 5 });
});

it("fresh session checks reject review requests authenticated before revocation", async () => {
  const p = await pair(); const job = await booking(p);
  await User.updateOne({ _id: p.homeowner.id }, { $inc: { authVersion: 1 } });
  await assert.rejects(submitReview(job.id, p.homeowner, { rating: 5, comment: "" }), { statusCode: 401 });
  assert.equal((await Booking.findById(job.id)).review, undefined);
});

it("profile aggregates ignore legacy ratings and expose no private review or booking data", async () => {
  const p = await pair();
  let response = await request(app).get(`/api/v1/artisan/profile/${p.profile.id}`).expect(200);
  assert.deepEqual(response.body.data.ratingSummary, { count: 0, average: null });
  await review(await booking(p), p.homeowner, { rating: 5, comment: "Private review text" }).expect(201);
  await review(await booking(p), p.homeowner, { rating: 2, comment: "Other review" }).expect(201);
  response = await request(app).get(`/api/v1/artisan/profile/${p.profile.id}`).expect(200);
  assert.deepEqual(response.body.data.ratingSummary, { count: 2, average: 3.5 });
  const directory = await request(app).get("/api/v1/artisan/profiles?limit=100").expect(200);
  assert.deepEqual(directory.body.data.find((r) => r.id === p.profile.id).ratingSummary, { count: 2, average: 3.5 });
  assert.equal(JSON.stringify(directory.body).includes("Private review text"), false);
  assert.equal(JSON.stringify(response.body).includes("Private booking address"), false);
  const own = await request(app).get("/api/v1/artisan/profile/me").set(auth(p.artisan)).expect(200);
  assert.deepEqual(own.body.data.ratingSummary, { count: 2, average: 3.5 });
});

it("status filtering respects ownership and paginates/counts the filtered set", async () => {
  const p = await pair();
  await booking(p, "completed"); await booking(p, "completed"); await booking(p, "pending");
  const response = await list(p.homeowner, "?status=completed&page=1&limit=1").expect(200);
  assert.equal(response.body.meta.total, 2);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].status, "completed");
  assert.equal((await list(await user(), "?status=completed").expect(200)).body.meta.total, 0);
  for (const query of ["?status=unknown", "?status=", "?status=pending&status=completed", "?status[x]=pending"]) {
    await list(p.homeowner, query).expect(400);
  }
});

it("status filters include effective expiries without depending on maintenance", async () => {
  const p = await pair();
  for (const rule of expiryRules) {
    const job = await booking(p, rule.from);
    // Modelled stale persisted stages deliberately exercise reads before sweep.
    await Booking.updateOne({ _id: job.id }, { $set: { [rule.field]: new Date(Date.now() - 10000) } }, { overwriteImmutable: true });
    const active = await list(p.homeowner, `?status=${rule.from}`).expect(200);
    assert.equal(active.body.data.some((r) => r.id === job.id), false);
    const expired = await list(p.homeowner, `?status=${rule.to}`).expect(200);
    assert.equal(expired.body.data.find((r) => r.id === job.id).status, rule.to);
    assert.equal(expired.body.meta.total, 1);
  }
});
