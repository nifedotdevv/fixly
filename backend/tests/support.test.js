import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-support-tests-only";
process.env.API_RATE_LIMIT_MAX = "10000";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Booking } = await import("../src/models/serviceRequest.js");
const { default: PaymentEvent } = await import("../src/models/paymentEvent.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const { assertNoBookingObligations } = await import("../src/services/requests/rules.js");
const { applyVerifiedPayment } = await import("../src/services/requests/verifiedPayments.js");
const { resolveProblem, resolveReconciliation } = await import("../src/services/requests/support.js");
const databaseName = createTestDatabaseName();
before(async () => {
  await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
    dbName: databaseName, serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([User.init(), Booking.init(), PaymentEvent.init(), Lock.init()]);
});
after(async () => { if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName); });
const auth = (actor) => ({ Authorization: `Bearer ${generateToken(actor)}` });
const actor = (role) => User.create({ firstName: "Support", lastName: "Tester", email: `${randomUUID()}@fixly.test`,
  password: "unused-test-password", role });
const fixture = async (status = "problem_reported") => {
  const [homeowner, artisan, admin] = await Promise.all([actor("house_owner"), actor("artisan"), actor("admin")]);
  const end = new Date(Date.now() - 3600000), start = new Date(Date.now() - 7200000);
  const booking = await Booking.create({ homeowner: homeowner._id, artisan: artisan._id, status,
    description: "Repair", serviceAddress: "Private service address", inspectionWindow: { start, end },
    responseDeadline: start, inspectionFee: { amount: 100, currency: "NGN" },
    inspection: { window: { start, end }, state: "completed", paymentDeadline: start },
    repair: { window: { start, end }, state: "confirmed", paymentDeadline: start },
    problem: { explanation: "Repair still leaks", reportedAt: new Date() } });
  return { homeowner, artisan, admin, booking };
};
const close = { disposition: "close", note: "Participants agreed to an external settlement", resolutionReference: "support:case-1" };
const resume = { disposition: "resume_confirmation", note: "Remedial work is ready for homeowner inspection" };
const resolve = (f, input = close, user = f.admin) => request(app)
  .post(`/api/v1/admin/support/requests/${f.booking.id}/resolve`).set(auth(user))
  .send({ problemReportedAt: f.booking.problem.reportedAt.toISOString(), ...input });
const receipt = (f, extra = {}) => PaymentEvent.create({ _id: `late:${randomUUID()}`, requestId: f.booking._id,
  homeowner: f.homeowner._id, artisan: f.artisan._id, purpose: "inspection", amount: 100,
  currency: "NGN", outcome: "reconciliation_required", ...extra });

describe("administrator support resolutions", () => {
  it("keeps support access admin-only and retains participant route privacy", async () => {
    const f = await fixture();
    await request(app).get("/api/v1/admin/support/requests").expect(401);
    await resolve(f, close, f.homeowner).expect(403);
    await request(app).get(`/api/v1/service-requests/${f.booking.id}`).set(auth(f.admin)).expect(404);
    const response = await request(app).get("/api/v1/admin/support/requests").set(auth(f.admin)).expect(200);
    assert.ok(response.body.data.some((record) => record._id === f.booking.id));
    await request(app).get(`/api/v1/admin/support/requests/${f.booking.id}`).set(auth(f.admin)).expect(200);
  });
  it("requires explicit evidence for closure and rejects spoofed resolution fields", async () => {
    const f = await fixture();
    await resolve(f, { disposition: "close", note: "Closed" }).expect(400);
    await resolve(f, { ...close, resolvedBy: f.homeowner.id }).expect(400);
    await resolve(f, { ...close, disposition: "mark_paid" }).expect(400);
    await resolve(f, { ...close, note: 42 }).expect(400);
    assert.equal((await Booking.findById(f.booking.id)).status, "problem_reported");
  });
  it("resumes homeowner confirmation without confirming work or recording payment", async () => {
    const f = await fixture();
    await resolve(f, resume).expect(200);
    const stored = await Booking.findById(f.booking.id);
    assert.equal(stored.status, "awaiting_homeowner_confirmation");
    assert.equal(stored.homeownerConfirmedAt, undefined);
    assert.equal(stored.verifiedPayments.length, 0);
    assert.equal(stored.supportResolutions[0].problemExplanation, "Repair still leaks");
    assert.equal(String(stored.supportResolutions[0].resolvedBy), f.admin.id);
    await assert.rejects(assertNoBookingObligations(f.homeowner._id), /unresolved/);
  });
  it("records terminal administrative closure with idempotent retries and private audit details", async () => {
    const f = await fixture();
    const initial = (await resolve(f).expect(200)).body.data;
    const repeated = (await resolve(f).expect(200)).body.data;
    assert.equal(initial.supportClosedAt, repeated.supportClosedAt);
    assert.equal(repeated.supportResolutions.length, 1);
    assert.equal(repeated.status, "support_closed");
    assert.equal(repeated.completedAt, undefined);
    assert.equal(repeated.repair.state, "released");
    await resolve(f, { ...close, note: "Different decision" }).expect(409);
    const view = (await request(app).get(`/api/v1/service-requests/${f.booking.id}`).set(auth(f.homeowner)).expect(200)).body.data;
    assert.equal(view.supportResolutions[0].disposition, "close");
    assert.equal(view.supportResolutions[0].note, undefined);
    assert.equal(view.supportResolutions[0].resolutionReference, undefined);
    await assertNoBookingObligations(f.homeowner._id);
  });
  it("rejects stale demoted administrators after acquiring account locks", async () => {
    const f = await fixture();
    await User.updateOne({ _id: f.admin._id }, { $set: { role: "house_owner" } });
    await assert.rejects(resolveProblem(f.booking.id, f.admin, {
      ...close, problemReportedAt: f.booking.problem.reportedAt.toISOString(),
    }), /administrator/);
    assert.equal((await Booking.findById(f.booking.id)).status, "problem_reported");
  });
  it("serializes conflicting resolutions and records one decision", async () => {
    const f = await fixture();
    const responses = await Promise.all([resolve(f), resolve(f, resume)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal((await Booking.findById(f.booking.id)).supportResolutions.length, 1);
    assert.equal(await Lock.countDocuments({}), 0);
  });
  it("rejects an administrator session revoked after authentication", async () => {
    const f = await fixture();
    await User.updateOne({ _id: f.admin.id }, { $inc: { authVersion: 1 } });
    await assert.rejects(resolveProblem(f.booking.id, f.admin, {
      ...close, problemReportedAt: f.booking.problem.reportedAt.toISOString(),
    }), /session/);
    assert.equal((await Booking.findById(f.booking.id)).status, "problem_reported");
  });
  it("keeps each new problem's resolution as an append-only audit record", async () => {
    const f = await fixture();
    await resolve(f, resume).expect(200);
    await Booking.updateOne({ _id: f.booking.id }, { $set: { status: "problem_reported",
      problem: { explanation: "Second problem", reportedAt: new Date(Date.now() + 1000) } } });
    await resolve(f, resume).expect(409);
    f.booking = await Booking.findById(f.booking.id);
    await resolve(f).expect(200);
    const stored = await Booking.findById(f.booking.id);
    assert.equal(stored.supportResolutions.length, 2);
    assert.equal(stored.supportResolutions[0].problemExplanation, "Repair still leaks");
    assert.equal(stored.supportResolutions[1].problemExplanation, "Second problem");
  });
  it("does not permit support closure of ordinary active bookings", async () => {
    const f = await fixture("repair_in_progress");
    await resolve(f).expect(409);
  });
});

describe("external reconciliation evidence", () => {
  const evidence = { disposition: "externally_refunded", note: "Operator verified provider refund receipt", resolutionReference: "refund:evidence-1" };
  it("clears only the resolved payment obligation and preserves verified-event replay semantics", async () => {
    const f = await fixture("cancelled");
    const event = await receipt(f);
    await assert.rejects(assertNoBookingObligations(f.homeowner._id), /unresolved/);
    const input = { ...evidence, paymentReference: event.id };
    const response = await request(app).post("/api/v1/admin/support/payments/resolve").set(auth(f.admin)).send(input).expect(200);
    assert.equal(response.body.data.outcome, "reconciliation_required");
    await request(app).post("/api/v1/admin/support/payments/resolve").set(auth(f.admin)).send(input).expect(200);
    await request(app).post("/api/v1/admin/support/payments/resolve").set(auth(f.admin))
      .send({ ...input, resolutionReference: "different" }).expect(409);
    await assertNoBookingObligations(f.homeowner._id);
    const replay = await applyVerifiedPayment({ requestId: f.booking.id, purpose: event.purpose,
      amount: event.amount, currency: event.currency, externalReference: event.id });
    assert.equal(replay.outcome, "reconciliation_required");
    assert.equal((await Booking.findById(f.booking.id)).status, "cancelled");
    assert.equal((await Booking.findById(f.booking.id)).verifiedPayments.length, 0);
  });
  it("retains independent unresolved receipts after booking closure", async () => {
    const f = await fixture();
    await receipt(f);
    await resolve(f).expect(200);
    await assert.rejects(assertNoBookingObligations(f.homeowner._id), /unresolved/);
    const results = await request(app).get("/api/v1/admin/support/payments").set(auth(f.admin)).expect(200);
    assert.ok(results.body.data.some((event) => event.requestId === f.booking.id));
  });
  it("rejects processing/applied events, stale admins, missing events and missing evidence", async () => {
    const f = await fixture("cancelled");
    for (const outcome of ["processing", "applied"]) {
      const event = await receipt(f, { outcome });
      await assert.rejects(resolveReconciliation(f.admin, { ...evidence, paymentReference: event.id }), /reconciliation-required/);
    }
    const event = await receipt(f);
    await request(app).post("/api/v1/admin/support/payments/resolve").set(auth(f.admin))
      .send({ ...evidence, paymentReference: event.id, resolutionReference: undefined }).expect(400);
    await assert.rejects(resolveReconciliation(f.admin, { ...evidence, paymentReference: "missing" }), /not found/);
    await User.updateOne({ _id: f.admin.id }, { $set: { isDeleted: true } });
    await assert.rejects(resolveReconciliation(f.admin, { ...evidence, paymentReference: event.id }), /administrator/);
  });
});
