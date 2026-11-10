import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-request-tests-only";
process.env.API_RATE_LIMIT_MAX = "10000";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: Booking } = await import("../src/models/serviceRequest.js");
const { default: PaymentEvent } = await import("../src/models/paymentEvent.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const { applyVerifiedPayment } = await import("../src/services/requests/verifiedPayments.js");
const { expireServiceRequests, splitQuote } = await import("../src/services/requests/rules.js");
const { assertSimulationAllowed } = await import("../scripts/simulate-request-payment.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init(), Booking.init(), PaymentEvent.init(), Lock.init()]);
beforeEach((t) => { t.mock.timers.enable({ apis: ["Date"], now: Date.now() }); });

const hour = 3600000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const auth = (user) => ({ Authorization: `Bearer ${generateToken(user)}` });
const user = (role = "house_owner", extra = {}) => User.create({
  firstName: "Request", lastName: "Tester", email: `${randomUUID()}@fixly.test`,
  password: "unused-test-password", role, ...extra,
});
const pair = async () => {
  const homeowner = await user(); const artisan = await user("artisan");
  await Profile.create({ user_id: artisan.id, professional_headline: "Experienced plumber", profession: "Plumber",
    experience_years: 3, phone_number: "08012345678", starting_price: 5000,
    residential_address: "Artisan home", office_address: "Artisan office" });
  return { homeowner, artisan };
};
const body = (artisan, extra = {}) => ({ artisan: artisan.id, description: "Repair the leaking kitchen tap",
  serviceAddress: "PRIVATE SERVICE ADDRESS 12 Example Street", inspectionWindow: { start: iso(24 * hour), end: iso(25 * hour) },
  responseDeadline: iso(hour), ...extra });
const create = (p, extra = {}) => request(app).post("/api/v1/service-requests").set(auth(p.homeowner)).send(body(p.artisan, extra));
const action = (id, actor, path, input = {}) => request(app).post(`/api/v1/service-requests/${id}/${path}`).set(auth(actor)).send(input);
const get = (id, actor) => request(app).get(`/api/v1/service-requests/${id}`).set(auth(actor));
const make = async (p, extra = {}) => (await create(p, extra).expect(201)).body.data;
const accept = (id, p) => action(id, p.artisan, "accept", { inspectionFee: { amount: 250000, currency: "NGN" } });
const pay = (id, purpose = "inspection", extra = {}) => applyVerifiedPayment({
  requestId: id, purpose, amount: purpose === "inspection" ? 250000 : purpose === "repair_deposit" ? 7001 : 3000,
  currency: "NGN", externalReference: `test:${randomUUID()}`, ...extra,
});
const inspect = async (t, p) => {
  const booking = await make(p);
  await accept(booking.id, p).expect(200);
  assert.equal((await pay(booking.id)).outcome, "applied");
  t.mock.timers.setTime(Date.parse(booking.inspectionWindow.end) + 1);
  await action(booking.id, p.artisan, "inspection/complete").expect(200);
  return booking.id;
};
const quote = (id, p, extra = {}) => action(id, p.artisan, "quote", {
  scope: "Replace damaged tap and supply fittings", total: { amount: 10001, currency: "NGN" },
  repairWindow: { start: iso(24 * hour), end: iso(25 * hour) }, expiresAt: iso(2 * hour), ...extra,
});
const quoted = async (t, p, extra = {}) => {
  const id = await inspect(t, p);
  await quote(id, p, extra).expect(200);
  return id;
};
const started = async (t, p) => {
  const id = await quoted(t, p);
  await action(id, p.homeowner, "quote/approve").expect(200);
  await pay(id, "repair_deposit");
  const detail = (await get(id, p.homeowner)).body.data;
  t.mock.timers.setTime(Date.parse(detail.repair.window.start));
  await action(id, p.artisan, "repair/start").expect(200);
  return id;
};
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

// Inputs and participant access are exercised through the real HTTP middleware and controllers.
describe("service request submission and privacy", () => {
  it("creates private participant-only requests with paginated participant lists", async () => {
    const p = await pair(); const stranger = await user(); const admin = await user("admin");
    const booking = await make(p);
    assert.equal(booking.homeowner, p.homeowner.id); assert.equal(booking.artisan, p.artisan.id);
    assert.equal(booking.status, "pending");
    for (const actor of [p.homeowner, p.artisan]) {
      const detail = await get(booking.id, actor).expect(200);
      assert.equal(detail.body.data.serviceAddress, body(p.artisan).serviceAddress);
      assert.equal(detail.body.data.password, undefined); assert.equal(detail.body.data.email, undefined);
      const list = await request(app).get("/api/v1/service-requests?page=1&limit=1").set(auth(actor)).expect(200);
      assert.equal(list.body.meta.total, 1); assert.equal(list.body.data[0].id, booking.id);
    }
    for (const actor of [stranger, admin]) {
      await get(booking.id, actor).expect(404);
      const list = await request(app).get("/api/v1/service-requests").set(auth(actor)).expect(200);
      assert.equal(list.body.meta.total, 0);
    }
    await request(app).get(`/api/v1/service-requests/${booking.id}`).expect(401);
    await get("invalid", p.homeowner).expect(400);
    const directory = await request(app).get("/api/v1/artisan/profiles").expect(200);
    assert.ok(!JSON.stringify(directory.body).includes("PRIVATE SERVICE ADDRESS"));
    const profile = await Profile.findOne({ user_id: p.artisan.id });
    const publicDetail = await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(200);
    assert.ok(!JSON.stringify(publicDetail.body).includes("PRIVATE SERVICE ADDRESS"));
  });

  it("rejects spoofed ownership, workflow/payment fields, unknown nested fields and invalid input", async () => {
    const p = await pair();
    for (const extra of [
      { homeowner: p.homeowner.id }, { status: "completed" }, { paid: true }, { verifiedPayments: [] },
      { artisan: "invalid" }, { description: "" }, { serviceAddress: "" },
      { inspectionWindow: { start: iso(-hour), end: iso(hour) } },
      { inspectionWindow: { start: iso(24 * hour), end: iso(23 * hour) } },
      { inspectionWindow: { start: iso(24 * hour), end: iso(24 * hour) } },
      { inspectionWindow: { start: "2027-01-01T12:00:00", end: iso(25 * hour) } },
      { inspectionWindow: { start: "2027-02-30T12:00:00Z", end: "2027-03-02T12:00:00Z" } },
      { inspectionWindow: { start: iso(24 * hour), end: iso(25 * hour), paid: true } },
      { responseDeadline: iso(-hour) }, { responseDeadline: iso(5 * 60000) },
      { responseDeadline: iso(26 * hour) }, { responseDeadline: iso(8 * 24 * hour) },
    ]) await create(p, extra).expect(400);
    assert.equal(await Booking.countDocuments({ homeowner: p.homeowner.id }), 0);
  });

  it("requires eligible active participants, disallows self-booking and accepts explicit timezone offsets", async () => {
    const p = await pair();
    await create({ ...p, homeowner: p.artisan }).expect(400);
    await create({ ...p, homeowner: await user("artisan") }).expect(403);
    await create({ ...p, artisan: await user() }).expect(400);
    await create({ ...p, artisan: await user("artisan") }).expect(400);
    await User.updateOne({ _id: p.artisan.id }, { isDeleted: true });
    await create(p).expect(400);
    await User.updateOne({ _id: p.artisan.id }, { isDeleted: false });
    await Profile.updateOne({ user_id: p.artisan.id }, { isDeleted: true });
    await create(p).expect(400);
    await Profile.updateOne({ user_id: p.artisan.id }, { isDeleted: false });
    const start = iso(24 * hour).replace("Z", "+00:00");
    const created = await create(p, { inspectionWindow: { start, end: iso(25 * hour) } }).expect(201);
    assert.equal(created.body.data.inspectionWindow.start, iso(24 * hour));
    await User.updateOne({ _id: p.homeowner.id }, { isDeleted: true });
    await create(p).expect(401);
  });

  it("appends notes only while pending and preserves submitted details", async () => {
    const p = await pair(); const booking = await make(p);
    await action(booking.id, p.artisan, "notes", { text: "Artisan edit" }).expect(403);
    await action(booking.id, p.homeowner, "notes", { text: "The tap is upstairs", serviceAddress: "Changed" }).expect(400);
    const updated = await action(booking.id, p.homeowner, "notes", { text: "The tap is upstairs" }).expect(200);
    assert.equal(updated.body.data.notes.length, 1); assert.equal(updated.body.data.description, booking.description);
    assert.equal(updated.body.data.serviceAddress, booking.serviceAddress);
    await request(app).patch(`/api/v1/service-requests/${booking.id}`).set(auth(p.homeowner)).send({ description: "Changed" }).expect(404);
    await accept(booking.id, p).expect(200);
    await action(booking.id, p.homeowner, "notes", { text: "Late clarification" }).expect(409);
  });
});

describe("response deadlines and inspection reservations", () => {
  it("expires unanswered requests immediately without cleanup and preserves history", async (t) => {
    const p = await pair(); const booking = await make(p);
    t.mock.timers.setTime(Date.parse(booking.responseDeadline));
    assert.equal((await get(booking.id, p.homeowner)).body.data.status, "response_expired");
    assert.equal((await Booking.findById(booking.id)).status, "pending");
    await accept(booking.id, p).expect(409);
    await action(booking.id, p.artisan, "reject", { reason: "Too late" }).expect(409);
    await action(booking.id, p.homeowner, "notes", { text: "Too late" }).expect(409);
    await expireServiceRequests({ _id: booking.id });
    assert.equal((await Booking.findById(booking.id)).status, "response_expired");
  });

  it("restricts acceptance/rejection and snapshots the explicit integer inspection fee", async () => {
    const p = await pair(); const booking = await make(p); const stranger = await user("artisan");
    await accept(booking.id, { ...p, artisan: p.homeowner }).expect(403);
    await accept(booking.id, { ...p, artisan: stranger }).expect(404);
    await action(booking.id, p.artisan, "accept").expect(400);
    await action(booking.id, p.artisan, "accept", { inspectionFee: { amount: 1.5, currency: "NGN" } }).expect(400);
    const accepted = (await accept(booking.id, p).expect(200)).body.data;
    assert.equal(accepted.status, "awaiting_inspection_payment"); assert.equal(accepted.inspection.state, "reserved");
    assert.equal(accepted.payments.length, 0); assert.equal(accepted.inspectionFee.amount, 250000);
    assert.ok(Date.parse(accepted.inspection.paymentDeadline) <= Date.parse(booking.inspectionWindow.start));
    await Profile.updateOne({ user_id: p.artisan.id }, { starting_price: 999999 });
    assert.equal((await get(booking.id, p.homeowner)).body.data.inspectionFee.amount, 250000);
    await accept(booking.id, p).expect(409);
    await action(booking.id, p.artisan, "reject", { reason: "Changed mind" }).expect(409);
    const another = await make(p);
    await action(another.id, p.homeowner, "reject", { reason: "No" }).expect(403);
    await action(another.id, p.artisan, "reject", { reason: "Cannot accommodate this time" }).expect(200);
    await accept(another.id, p).expect(409);
  });

  it("permits exactly one concurrent overlapping acceptance and permits adjacent windows", async () => {
    const p = await pair(); const other = { ...p, homeowner: await user() };
    const first = await make(p); const second = await make(other);
    const results = await Promise.all([accept(first.id, p), accept(second.id, other)]);
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409]);
    assert.equal(await Booking.countDocuments({ artisan: p.artisan.id, "inspection.state": "reserved" }), 1);
    const adjacent = await make(other, { inspectionWindow: { start: first.inspectionWindow.end, end: iso(26 * hour) } });
    await accept(adjacent.id, other).expect(200);
  });

  it("blocks confirmed appointments and releases cancelled or expired reservations", async (t) => {
    const p = await pair(); const first = await make(p); const second = await make(p);
    await accept(first.id, p).expect(200);
    await action(first.id, p.artisan, "cancel").expect(403);
    await action(first.id, p.homeowner, "cancel").expect(200);
    await accept(second.id, p).expect(200);
    const secondView = (await get(second.id, p.homeowner)).body.data;
    t.mock.timers.setTime(Date.parse(secondView.inspection.paymentDeadline));
    assert.equal((await get(second.id, p.homeowner)).body.data.status, "inspection_payment_expired");
    const third = await make(p);
    // Advancing only the app clock must not free a reservation still valid on the database clock.
    await accept(third.id, p).expect(409);
    await Booking.updateOne({ _id: second.id }, { $set: { "inspection.paymentDeadline": new Date(0) } });
    await accept(third.id, p).expect(200);
    await pay(third.id);
    const fourth = await make(p); await accept(fourth.id, p).expect(409);
    await action(third.id, p.homeowner, "cancel").expect(409);
  });

  it("caps payment reservations at inspection start", async (t) => {
    const p = await pair(); const booking = await make(p, { inspectionWindow: { start: iso(20 * 60000), end: iso(hour) }, responseDeadline: iso(16 * 60000) });
    t.mock.timers.setTime(Date.now() + 10 * 60000);
    const accepted = (await accept(booking.id, p).expect(200)).body.data;
    assert.equal(accepted.inspection.paymentDeadline, booking.inspectionWindow.start);
  });
});

describe("verified payment boundary", () => {
  it("rejects public payment flags/endpoints and disables the simulator by default and in production", async () => {
    const p = await pair(); const booking = await make(p);
    await action(booking.id, p.homeowner, "mark-paid", { paid: true }).expect(404);
    await action(booking.id, p.artisan, "accept", { inspectionFee: { amount: 250000, currency: "NGN" }, paid: true }).expect(400);
    assert.throws(() => assertSimulationAllowed({ NODE_ENV: "development" }), /requires/);
    assert.throws(() => assertSimulationAllowed({ NODE_ENV: "production", ENABLE_PAYMENT_SIMULATION: "true" }), /requires/);
    assert.doesNotThrow(() => assertSimulationAllowed({ NODE_ENV: "test", ENABLE_PAYMENT_SIMULATION: "true" }));
  });

  it("checks purpose, amount, currency and stage, and confirms only through verified events", async () => {
    const p = await pair(); const booking = await make(p);
    await assert.rejects(pay(booking.id), /does not match/);
    await accept(booking.id, p).expect(200);
    for (const extra of [{ amount: 249999 }, { currency: "USD" }, { purpose: "repair_deposit" }]) {
      await assert.rejects(pay(booking.id, "inspection", extra), /does not match/);
    }
    const detail = (await get(booking.id, p.homeowner)).body.data;
    assert.equal(detail.inspection.state, "reserved");
    await action(booking.id, p.artisan, "inspection/complete").expect(409);
    await pay(booking.id);
    assert.equal((await get(booking.id, p.homeowner)).body.data.inspection.state, "confirmed");
    await assert.rejects(pay(booking.id), /not eligible/);
    await action(booking.id, p.artisan, "inspection/complete").expect(409);
  });

  it("handles repeated events idempotently and disallows reuse against other requests", async () => {
    const p = await pair(); const first = await make(p); await accept(first.id, p).expect(200);
    const reference = `test:${randomUUID()}`;
    const initial = await pay(first.id, "inspection", { externalReference: reference });
    assert.deepEqual(await pay(first.id, "inspection", { externalReference: reference }), initial);
    assert.deepEqual(await pay(first.id.toUpperCase(), "inspection", { externalReference: reference }), initial);
    await assert.rejects(pay(first.id, "inspection", { externalReference: reference, amount: 1 }), /already used/);
    const second = await make(p, { inspectionWindow: { start: iso(26 * hour), end: iso(27 * hour) } });
    await accept(second.id, p).expect(200);
    await assert.rejects(pay(second.id, "inspection", { externalReference: reference }), /already used/);
    assert.equal((await Booking.findById(first.id)).verifiedPayments.length, 1);
    assert.equal((await Booking.findById(second.id)).verifiedPayments.length, 0);
  });

  it("allows a global external reference to apply to at most one request under concurrent processing", async () => {
    const firstPair = await pair(); const secondPair = await pair();
    const first = await make(firstPair); const second = await make(secondPair);
    await accept(first.id, firstPair).expect(200); await accept(second.id, secondPair).expect(200);
    const externalReference = `concurrent:${randomUUID()}`;
    const results = await Promise.allSettled([
      pay(first.id, "inspection", { externalReference }), pay(second.id, "inspection", { externalReference }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled" && result.value.outcome === "applied").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.equal(rejected.reason.statusCode, 409);
    const records = await Booking.find({ _id: { $in: [first.id, second.id] } });
    assert.equal(records.reduce((sum, record) => sum + record.verifiedPayments.length, 0), 1);
    assert.equal(await PaymentEvent.countDocuments({ _id: externalReference }), 1);
    assert.equal(await Lock.countDocuments({ _id: { $in: [firstPair.artisan.id, firstPair.homeowner.id, secondPair.artisan.id, secondPair.homeowner.id] } }), 0);
  });

  it("returns reconciliation for late or cancelled-reservation events without reclaiming availability", async (t) => {
    const p = await pair(); const first = await make(p); await accept(first.id, p).expect(200);
    const accepted = (await get(first.id, p.homeowner)).body.data;
    t.mock.timers.setTime(Date.parse(accepted.inspection.paymentDeadline));
    // The database clock is independent of the test's mocked application clock.
    await Booking.updateOne({ _id: first.id }, { $set: { "inspection.paymentDeadline": new Date(0) } });
    const second = await make(p); await accept(second.id, p).expect(200);
    const reference = `late:${randomUUID()}`;
    const late = await pay(first.id, "inspection", { externalReference: reference });
    assert.equal(late.outcome, "reconciliation_required");
    assert.deepEqual(await pay(first.id, "inspection", { externalReference: reference }), late);
    assert.equal((await get(first.id, p.homeowner)).body.data.status, "inspection_payment_expired");
    assert.equal((await get(second.id, p.homeowner)).body.data.inspection.state, "reserved");
    await action(second.id, p.homeowner, "cancel").expect(200);
    assert.equal((await pay(second.id)).outcome, "reconciliation_required");
  });

  it("cannot confirm a payment if its deadline passes before the atomic booking write", async (t) => {
    const p = await pair(); const booking = await make(p); await accept(booking.id, p).expect(200);
    const original = Booking.prototype.save;
    t.mock.method(Booking.prototype, "save", async function (...args) {
      if (this.id === booking.id && this.status === "inspection_confirmed") {
        // Model a deadline crossing between the service's check and MongoDB's conditional write.
        await Booking.updateOne({ _id: this._id }, { $set: { "inspection.paymentDeadline": new Date(Date.now() - 1) } });
      }
      return original.apply(this, args);
    });
    const outcome = await pay(booking.id);
    assert.equal(outcome.outcome, "reconciliation_required");
    const stored = await Booking.findById(booking.id);
    assert.equal(stored.status, "awaiting_inspection_payment");
    assert.equal(stored.verifiedPayments.length, 0);
    assert.equal((await get(booking.id, p.homeowner)).body.data.status, "inspection_payment_expired");
  });

  it("recovers a replay after the booking write but before receipt finalisation", async (t) => {
    const p = await pair(); const booking = await make(p); await accept(booking.id, p).expect(200);
    const original = PaymentEvent.prototype.save;
    const fault = t.mock.method(PaymentEvent.prototype, "save", async function (...args) {
      if (this.outcome === "applied") throw new Error("receipt finalisation unavailable");
      return original.apply(this, args);
    });
    const reference = `replay:${randomUUID()}`;
    await assert.rejects(pay(booking.id, "inspection", { externalReference: reference }), /finalisation unavailable/);
    fault.mock.restore();
    assert.equal((await Booking.findById(booking.id)).status, "inspection_confirmed");
    assert.equal((await PaymentEvent.findById(reference)).outcome, "processing");
    assert.equal((await pay(booking.id, "inspection", { externalReference: reference })).outcome, "applied");
    assert.equal((await Booking.findById(booking.id)).verifiedPayments.length, 1);
  });
});

// Advance the mocked UTC clock rather than altering persisted stages to exercise the full journey.
describe("inspection, quotes and repair completion", () => {
  it("requires a completed confirmed inspection and keeps submitted quote terms immutable", async (t) => {
    const p = await pair(); const booking = await make(p);
    await quote(booking.id, p).expect(409);
    await accept(booking.id, p).expect(200); await pay(booking.id);
    t.mock.timers.setTime(Date.parse(booking.inspectionWindow.end));
    await action(booking.id, p.homeowner, "inspection/complete").expect(403);
    await action(booking.id, p.artisan, "inspection/complete").expect(200);
    await quote(booking.id, { ...p, artisan: p.homeowner }).expect(403);
    await quote(booking.id, p, { total: { amount: 3, currency: "NGN" } }).expect(400);
    await quote(booking.id, p, { expiresAt: iso(-hour) }).expect(400);
    const submitted = (await quote(booking.id, p).expect(200)).body.data;
    assert.equal(submitted.quote.depositAmount, 7001); assert.equal(submitted.quote.balanceAmount, 3000);
    await quote(booking.id, p, { scope: "Different terms" }).expect(409);
    await action(booking.id, p.artisan, "quote/approve").expect(403);
    await action(booking.id, p.homeowner, "quote/decline").expect(200);
    assert.equal((await get(booking.id, p.homeowner)).body.data.status, "repair_not_proceeding");
  });

  it("expires submitted quotes and unpaid repair reservations without a cleanup worker", async (t) => {
    const p = await pair(); const id = await quoted(t, p);
    let detail = (await get(id, p.homeowner)).body.data;
    t.mock.timers.setTime(Date.parse(detail.quote.expiresAt));
    await action(id, p.homeowner, "quote/approve").expect(409);
    assert.equal((await get(id, p.homeowner)).body.data.status, "quote_expired");
    const p2 = await pair(); const second = await quoted(t, p2);
    await action(second, p2.homeowner, "quote/approve").expect(200);
    detail = (await get(second, p2.homeowner)).body.data;
    assert.ok(Date.parse(detail.repair.paymentDeadline) <= Date.parse(detail.quote.expiresAt));
    t.mock.timers.setTime(Date.parse(detail.repair.paymentDeadline));
    assert.equal((await get(second, p2.homeowner)).body.data.status, "repair_payment_expired");
    assert.equal((await pay(second, "repair_deposit")).outcome, "reconciliation_required");
    await action(second, p2.artisan, "repair/start").expect(409);
  });

  it("checks repair conflicts using the same schedule as inspection reservations", async (t) => {
    const p = await pair(); const id = await quoted(t, p);
    const detail = (await get(id, p.homeowner)).body.data;
    const competing = await make(p, { inspectionWindow: detail.quote.window });
    await accept(competing.id, p).expect(200);
    await action(id, p.homeowner, "quote/approve").expect(409);
    await action(competing.id, p.homeowner, "cancel").expect(200);
    await action(id, p.homeowner, "quote/approve").expect(200);
    const another = await make(p, { inspectionWindow: detail.quote.window });
    await accept(another.id, p).expect(409);
    await action(id, p.homeowner, "cancel").expect(200);
    const cancelled = (await get(id, p.homeowner)).body.data;
    assert.equal(cancelled.status, "repair_not_proceeding"); assert.equal(cancelled.inspection.state, "completed");
    assert.equal(cancelled.payments.length, 1);
    await accept(another.id, p).expect(200);
  });

  it("serializes concurrent repair approvals and blocks both temporary and confirmed repair windows", async (t) => {
    const p = await pair();
    const first = await inspect(t, p);
    const other = { ...p, homeowner: await user() };
    const second = await inspect(t, other);
    await quote(first, p).expect(200);
    await quote(second, other).expect(200);
    const results = await Promise.all([
      action(first, p.homeowner, "quote/approve"), action(second, other.homeowner, "quote/approve"),
    ]);
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409]);
    const winner = results[0].status === 200 ? { id: first, p } : { id: second, p: other };
    const loser = results[0].status === 200 ? { id: second, p: other } : { id: first, p };
    await action(loser.id, loser.p.homeowner, "quote/approve").expect(409);
    await pay(winner.id, "repair_deposit");
    await action(loser.id, loser.p.homeowner, "quote/approve").expect(409);
    const stored = await Booking.find({ artisan: p.artisan.id, "repair.state": "confirmed" });
    assert.equal(stored.length, 1);
  });

  it("requires deposit confirmation and repair start time, then separates completion from settlement", async (t) => {
    const p = await pair(); const id = await quoted(t, p);
    await action(id, p.homeowner, "quote/approve").expect(200);
    await action(id, p.artisan, "repair/start").expect(409);
    await assert.rejects(pay(id, "repair_balance"), /not eligible/);
    await pay(id, "repair_deposit");
    await action(id, p.artisan, "repair/start").expect(409);
    const approved = (await get(id, p.homeowner)).body.data;
    t.mock.timers.setTime(Date.parse(approved.repair.window.start));
    await action(id, p.homeowner, "repair/start").expect(403);
    await action(id, p.artisan, "repair/start").expect(200);
    await action(id, p.homeowner, "cancel").expect(409);
    await action(id, p.homeowner, "repair/complete").expect(403);
    const reported = (await action(id, p.artisan, "repair/complete").expect(200)).body.data;
    assert.equal(reported.status, "awaiting_homeowner_confirmation");
    await assert.rejects(pay(id, "repair_balance"), /not eligible/);
    await action(id, p.artisan, "completion/confirm").expect(403);
    await action(id, p.homeowner, "completion/confirm").expect(200);
    assert.equal((await get(id, p.homeowner)).body.data.status, "awaiting_final_payment");
    await pay(id, "repair_balance");
    const settled = (await get(id, p.homeowner)).body.data;
    assert.equal(settled.status, "completed"); assert.equal(settled.payments.length, 3);
    assert.equal(settled.quote.depositAmount + settled.quote.balanceAmount, settled.quote.total.amount);
    assert.equal(settled.payments[0].externalReference, undefined);
  });

  it("requires a problem explanation and blocks normal finalisation and ordinary cancellation", async (t) => {
    const p = await pair(); const id = await started(t, p);
    await action(id, p.artisan, "repair/complete").expect(200);
    await action(id, p.artisan, "problems", { explanation: "Not the homeowner" }).expect(403);
    await action(id, p.homeowner, "problems", { explanation: "" }).expect(400);
    await action(id, p.homeowner, "problems", { explanation: "The tap still leaks" }).expect(200);
    await action(id, p.homeowner, "completion/confirm").expect(409);
    await action(id, p.homeowner, "cancel").expect(409);
    await assert.rejects(pay(id, "repair_balance"), /not eligible/);
    assert.equal((await get(id, p.homeowner)).body.data.problem.explanation, "The tap still leaks");
  });

  it("splits every allowed small total and safe-integer extremes exactly", () => {
    for (const total of [4, 5, 9, 10, 11, 99, 100, 101, 10001, Number.MAX_SAFE_INTEGER]) {
      const split = splitQuote(total);
      assert.equal(split.depositAmount + split.balanceAmount, total);
      assert.ok(split.depositAmount > 0 && split.balanceAmount > 0);
      assert.equal(BigInt(split.depositAmount), (BigInt(total) * 70n + 99n) / 100n);
    }
  });
});

describe("booking and account lifecycle coordination", () => {
  it("blocks deletion, soft deletion and role changes while obligations remain; preserves resolved history", async () => {
    const p = await pair(); const admin = await user("admin"); const booking = await make(p);
    for (const participant of [p.homeowner, p.artisan]) {
      await request(app).delete(`/api/v1/admin/user/${participant.id}`).set(auth(admin)).expect(409);
      await request(app).patch(`/api/v1/admin/user/${participant.id}/soft-delete`).set(auth(admin)).expect(409);
      await request(app).patch(`/api/v1/admin/user/${participant.id}`).set(auth(admin)).send({ role: "admin" }).expect(409);
      assert.equal((await User.findById(participant.id)).isDeleted, false);
    }
    await action(booking.id, p.homeowner, "cancel").expect(200);
    await request(app).delete(`/api/v1/admin/user/${p.homeowner.id}`).set(auth(admin)).expect(200);
    await request(app).delete(`/api/v1/admin/user/${p.artisan.id}`).set(auth(admin)).expect(200);
    assert.ok(await Booking.findById(booking.id));
  });

  it("does not let effective response/payment expiry block deletion indefinitely", async (t) => {
    const p = await pair(); const admin = await user("admin"); const booking = await make(p);
    t.mock.timers.setTime(Date.parse(booking.responseDeadline));
    await request(app).delete(`/api/v1/admin/user/${p.homeowner.id}`).set(auth(admin)).expect(200);
    assert.ok(await Booking.findById(booking.id));
    const p2 = await pair(); const second = await make(p2); await accept(second.id, p2).expect(200);
    const detail = (await get(second.id, p2.homeowner)).body.data;
    t.mock.timers.setTime(Date.parse(detail.inspection.paymentDeadline));
    await request(app).delete(`/api/v1/admin/user/${p2.homeowner.id}`).set(auth(admin)).expect(200);
    assert.equal((await pay(second.id)).outcome, "reconciliation_required");
    await request(app).delete(`/api/v1/admin/user/${p2.artisan.id}`).set(auth(admin)).expect(409);
  });

  it("keeps paid obligations and reported problems unresolved until a future support workflow", async (t) => {
    const p = await pair(); const admin = await user("admin"); const id = await started(t, p);
    await action(id, p.artisan, "repair/complete").expect(200);
    await action(id, p.homeowner, "problems", { explanation: "Still broken" }).expect(200);
    await request(app).delete(`/api/v1/admin/user/${p.homeowner.id}`).set(auth(admin)).expect(409);
    await request(app).delete(`/api/v1/admin/user/${p.artisan.id}`).set(auth(admin)).expect(409);
  });

  it("allows deletion after homeowner confirmation and verified final payment, retaining booking history", async (t) => {
    const p = await pair(); const admin = await user("admin"); const id = await started(t, p);
    await action(id, p.artisan, "repair/complete").expect(200);
    await action(id, p.homeowner, "completion/confirm").expect(200);
    await request(app).delete(`/api/v1/admin/user/${p.homeowner.id}`).set(auth(admin)).expect(409);
    await pay(id, "repair_balance");
    await request(app).delete(`/api/v1/admin/user/${p.homeowner.id}`).set(auth(admin)).expect(200);
    await get(id, p.artisan).expect(200);
    assert.equal((await Booking.findById(id)).status, "completed");
  });

  it("prevents deletion or role changes from passing an in-flight request creation", { timeout: 10000 }, async (t) => {
    const p = await pair(); const admin = await user("admin");
    const entered = deferred(); const release = deferred();
    const original = Booking.create.bind(Booking);
    t.mock.method(Booking, "create", async (...args) => { entered.resolve(); await release.promise; return original(...args); });
    const pending = create(p).then((res) => res);
    try {
      await entered.promise;
      for (const participant of [p.homeowner, p.artisan]) {
        await request(app).delete(`/api/v1/admin/user/${participant.id}`).set(auth(admin)).expect(409);
        await request(app).patch(`/api/v1/admin/user/${participant.id}`).set(auth(admin)).send({ role: "admin" }).expect(409);
      }
    } finally { release.resolve(); assert.equal((await pending).status, 201); }
    assert.equal(await Lock.countDocuments({ _id: { $in: [p.homeowner.id, p.artisan.id] } }), 0);
  });

  it("holds participant locks through acceptance and prevents lifecycle changes during the reservation write", { timeout: 10000 }, async (t) => {
    const p = await pair(); const admin = await user("admin"); const booking = await make(p);
    const entered = deferred(); const release = deferred();
    const original = Booking.prototype.save;
    t.mock.method(Booking.prototype, "save", async function (...args) {
      if (this.id === booking.id && this.status === "awaiting_inspection_payment") {
        entered.resolve(); await release.promise;
      }
      return original.apply(this, args);
    });
    const pending = accept(booking.id, p).then((res) => res);
    try {
      await entered.promise;
      for (const participant of [p.homeowner, p.artisan]) {
        const deletion = await request(app).delete(`/api/v1/admin/user/${participant.id}`).set(auth(admin)).expect(409);
        assert.match(deletion.body.message, /in progress/);
        const roleChange = await request(app).patch(`/api/v1/admin/user/${participant.id}`).set(auth(admin)).send({ role: "admin" }).expect(409);
        assert.match(roleChange.body.message, /in progress/);
      }
    } finally { release.resolve(); assert.equal((await pending).status, 200); }
    assert.equal((await Booking.findById(booking.id)).inspection.state, "reserved");
    assert.equal(await Lock.countDocuments({ _id: { $in: [p.homeowner.id, p.artisan.id] } }), 0);
  });

  it("rechecks the homeowner role after a concurrent role change completes", { timeout: 10000 }, async (t) => {
    const p = await pair(); const admin = await user("admin");
    const entered = deferred(); const release = deferred(); let paused = false;
    const original = User.findById.bind(User);
    t.mock.method(User, "findById", (...args) => {
      const query = original(...args);
      if (!paused && args[0].toString() === p.homeowner.id) {
        paused = true; const exec = query.exec.bind(query);
        query.exec = async (...execArgs) => { const result = await exec(...execArgs); entered.resolve(); await release.promise; return result; };
      }
      return query;
    });
    const pending = create(p).then((res) => res);
    try {
      await entered.promise;
      await request(app).patch(`/api/v1/admin/user/${p.homeowner.id}`).set(auth(admin)).send({ role: "admin" }).expect(200);
    } finally { release.resolve(); }
    assert.equal((await pending).status, 403);
    assert.equal(await Booking.countDocuments({ homeowner: p.homeowner.id }), 0);
  });

  for (const deleted of ["homeowner", "artisan"]) {
    it(`rejects an authenticated request when the ${deleted} is deleted before booking locks are acquired`, { timeout: 10000 }, async (t) => {
      const p = await pair(); const admin = await user("admin");
      const entered = deferred(); const release = deferred(); let paused = false;
      const original = User.findById.bind(User);
      t.mock.method(User, "findById", (...args) => {
        const query = original(...args);
        if (!paused && args[0].toString() === p.homeowner.id) {
          paused = true; const exec = query.exec.bind(query);
          query.exec = async (...execArgs) => { const result = await exec(...execArgs); entered.resolve(); await release.promise; return result; };
        }
        return query;
      });
      const pending = create(p).then((res) => res);
      try {
        await entered.promise;
        await request(app).delete(`/api/v1/admin/user/${p[deleted].id}`).set(auth(admin)).expect(200);
      } finally { release.resolve(); }
      assert.equal((await pending).status, deleted === "homeowner" ? 403 : 400);
      assert.equal(await Booking.countDocuments({ homeowner: p.homeowner.id }), 0);
    });
  }

  it("honours a scheduling lock held by an independent MongoDB connection", async (t) => {
    const p = await pair(); const booking = await make(p);
    const connection = await mongoose.createConnection(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", { dbName: databaseName }).asPromise();
    t.after(() => connection.close());
    const OtherLock = connection.model("AccountLifecycleLock", Lock.schema);
    const token = randomUUID();
    await OtherLock.create({ _id: p.artisan.id, token, action: "service-request", host: "other-api", processId: 123 });
    await accept(booking.id, p).expect(409);
    await OtherLock.deleteOne({ _id: p.artisan.id, token });
    await accept(booking.id, p).expect(200);
  });
});
