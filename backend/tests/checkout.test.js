import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";
import { fakePaystack } from "./helpers/fakePaystack.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-checkout-tests-only";
process.env.API_RATE_LIMIT_MAX = "10000";
// Never the developer's real key: every test below replaces the provider client anyway.
process.env.PAYSTACK_SECRET_KEY = "sk_test_checkoutunit";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: Booking } = await import("../src/models/serviceRequest.js");
const { default: PaymentEvent } = await import("../src/models/paymentEvent.js");
const { default: PaymentAttempt } = await import("../src/models/paymentAttempt.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const { applyVerifiedPayment } = await import("../src/services/requests/verifiedPayments.js");
const { splitQuote } = await import("../src/services/requests/rules.js");
const { paymentProvider } = await import("../src/services/payments/paystack.js");
const { flushDetached } = await import("../src/services/backgroundTask.js");

const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init(), Booking.init(), PaymentEvent.init(), PaymentAttempt.init(), Lock.init()]);

// Fake Paystack (see helpers/fakePaystack.js). Background refunds are drained before each mock is restored.
let provider;
beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  provider = fakePaystack(t, { paymentProvider, PaymentAttempt, PaymentEvent });
});
afterEach(() => flushDetached());

const minute = 60000;
const hour = 60 * minute;
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const auth = (user) => ({ Authorization: `Bearer ${generateToken(user)}` });
const user = (role = "house_owner", extra = {}) => User.create({
  firstName: "Checkout", lastName: "Tester", email: `${randomUUID()}@fixly.test`, password: "unused-test-password", role, ...extra,
});
const pair = async () => {
  const homeowner = await user(); const artisan = await user("artisan");
  await Profile.create({ user_id: artisan.id, professional_headline: "Experienced plumber", profession: "Plumber",
    experience_years: 3, phone_number: "08012345678", starting_price: 5000,
    residential_address: "Artisan home", office_address: "Artisan office" });
  return { homeowner, artisan };
};
const action = (id, actor, path, input = {}) => request(app).post(`/api/v1/service-requests/${id}/${path}`).set(auth(actor)).send(input);
const pay = (id, actor, input = {}) => action(id, actor, "payments", input);
const created = async (p) => (await request(app).post("/api/v1/service-requests").set(auth(p.homeowner)).send({
  artisan: p.artisan.id, description: "Repair the leaking kitchen tap", serviceAddress: "12 Example Street",
  inspectionWindow: { start: iso(24 * hour), end: iso(25 * hour) }, responseDeadline: iso(hour),
}).expect(201)).body.data.id;
const accepted = async (p) => {
  const id = await created(p);
  await action(id, p.artisan, "accept", { inspectionFee: { amount: 250000, currency: "NGN" } }).expect(200);
  return id;
};
const applied = (id, purpose, amount) => applyVerifiedPayment({
  requestId: id, purpose, amount, currency: "NGN", externalReference: `test:${randomUUID()}`,
});

describe("POST /service-requests/:id/payments", () => {
  it("starts the inspection checkout with the server's amount and the homeowner's email", async () => {
    const p = await pair();
    const id = await accepted(p);
    const res = await pay(id, p.homeowner).expect(201);
    const data = res.body.data;
    assert.equal(data.purpose, "inspection");
    assert.equal(data.amount, 250000);
    assert.equal(data.currency, "NGN");
    assert.equal(data.accessCode, "ac_1");
    assert.match(data.reference, new RegExp(`^fx-ins-${id}-[0-9a-f]{12}$`));
    assert.ok(Date.parse(data.paymentDeadline) > Date.now());

    assert.equal(provider.calls.length, 1);
    assert.deepEqual(provider.calls[0], {
      email: p.homeowner.email, amount: 250000, currency: "NGN", reference: data.reference,
      metadata: { requestId: id, purpose: "inspection" },
    });
    const attempt = await PaymentAttempt.findById(data.reference).lean();
    assert.equal(attempt.purpose, "inspection");
    assert.equal(attempt.amount, 250000);
    assert.equal(attempt.homeowner.toString(), p.homeowner.id);
  });

  it("reuses an open attempt for repeat clicks, and starts a new one after 15 minutes", async (t) => {
    const p = await pair();
    const id = await accepted(p);
    const first = (await pay(id, p.homeowner).expect(201)).body.data;
    const again = (await pay(id, p.homeowner).expect(201)).body.data;
    assert.equal(again.reference, first.reference);
    assert.equal(again.accessCode, first.accessCode);
    assert.equal(provider.calls.length, 1);

    t.mock.timers.setTime(Date.now() + 15 * minute + 1);
    const later = (await pay(id, p.homeowner).expect(201)).body.data;
    assert.notEqual(later.reference, first.reference);
    assert.equal(provider.calls.length, 2);
  });

  it("charges the 70% deposit after the quote is approved, then the balance after the homeowner confirms", async (t) => {
    const p = await pair();
    const id = await accepted(p);
    await applied(id, "inspection", 250000);
    const booking = await Booking.findById(id);
    t.mock.timers.setTime(booking.inspectionWindow.end.getTime() + 1);
    await action(id, p.artisan, "inspection/complete").expect(200);
    await action(id, p.artisan, "quote", {
      scope: "Replace damaged tap and supply fittings", total: { amount: 8500000, currency: "NGN" },
      repairWindow: { start: iso(24 * hour), end: iso(25 * hour) }, expiresAt: iso(2 * hour),
    }).expect(200);
    await action(id, p.homeowner, "quote/approve").expect(200);
    const { depositAmount, balanceAmount } = splitQuote(8500000);

    const deposit = (await pay(id, p.homeowner).expect(201)).body.data;
    assert.equal(deposit.purpose, "repair_deposit");
    assert.equal(deposit.amount, depositAmount);
    assert.match(deposit.reference, /^fx-dep-/);

    await applied(id, "repair_deposit", depositAmount);
    const repair = await Booking.findById(id);
    t.mock.timers.setTime(repair.repair.window.start.getTime() + 1);
    await action(id, p.artisan, "repair/start").expect(200);
    await action(id, p.artisan, "repair/complete").expect(200);
    await action(id, p.homeowner, "completion/confirm").expect(200);

    const balance = (await pay(id, p.homeowner).expect(201)).body.data;
    assert.equal(balance.purpose, "repair_balance");
    assert.equal(balance.amount, balanceAmount);
    assert.equal(balance.paymentDeadline, null);
  });

  it("only lets the homeowner pay, and hides the request from strangers", async () => {
    const p = await pair();
    const id = await accepted(p);
    const artisanRes = await pay(id, p.artisan).expect(403);
    assert.match(artisanRes.body.message, /Only the homeowner/);
    await pay(id, await user()).expect(404);
    assert.equal(provider.calls.length, 0);
  });

  it("refuses when nothing is due, when the deadline has passed or is about to", async (t) => {
    const p = await pair();
    const pending = await created(p);
    assert.equal((await pay(pending, p.homeowner).expect(409)).body.code, "PAYMENT_NOT_DUE");

    const id = await accepted(p);
    const { inspection } = await Booking.findById(id);
    t.mock.timers.setTime(inspection.paymentDeadline.getTime() - minute);
    assert.equal((await pay(id, p.homeowner).expect(409)).body.code, "PAYMENT_WINDOW_CLOSING");
    t.mock.timers.setTime(inspection.paymentDeadline.getTime() + 1);
    assert.equal((await pay(id, p.homeowner).expect(409)).body.code, "PAYMENT_NOT_DUE");
    assert.equal(provider.calls.length, 0);
  });

  it("ignores any amount the browser tries to send", async () => {
    const p = await pair();
    const id = await accepted(p);
    await pay(id, p.homeowner, { amount: 100 }).expect(400);
    assert.equal(provider.calls.length, 0);
  });

  it("requires a verified email", async () => {
    const p = await pair();
    const id = await accepted(p);
    await User.updateOne({ _id: p.homeowner._id }, { emailVerified: false });
    const res = await pay(id, p.homeowner).expect(403);
    assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");
  });

  it("does not start a checkout when the artisan is no longer eligible", async () => {
    const p = await pair();
    const id = await accepted(p);
    await User.updateOne({ _id: p.artisan._id }, { isDeleted: true });
    await pay(id, p.homeowner).expect(400);
    assert.equal(provider.calls.length, 0);
  });

  it("saves no attempt when Paystack fails", async () => {
    const p = await pair();
    const id = await accepted(p);
    provider.fail = Object.assign(new Error("The payment provider could not complete this request. Please try again."),
      { statusCode: 502, code: "PAYMENT_PROVIDER_ERROR" });
    const res = await pay(id, p.homeowner).expect(502);
    assert.equal(res.body.code, "PAYMENT_PROVIDER_ERROR");
    assert.equal(await PaymentAttempt.countDocuments({ requestId: id }), 0);
  });
});

const confirm = (id, actor, reference) => request(app).post(`/api/v1/service-requests/${id}/payments/${reference}/verify`).set(auth(actor)).send({});
const started = async () => {
  const p = await pair();
  const id = await accepted(p);
  const { reference } = (await pay(id, p.homeowner).expect(201)).body.data;
  return { p, id, reference };
};
const paidStarted = async () => {
  const run = await started();
  provider.paid.add(run.reference);
  return run;
};
const events = (id) => PaymentEvent.find({ requestId: id }).lean();

describe("POST /service-requests/:id/payments/:reference/verify", () => {
  it("applies a payment Paystack confirms and returns the updated request", async () => {
    const { p, id, reference } = await paidStarted();
    const data = (await confirm(id, p.homeowner, reference).expect(200)).body.data;
    assert.equal(data.status, "success");
    assert.equal(data.outcome, "applied");
    assert.equal(data.purpose, "inspection");
    assert.equal(data.request.status, "inspection_confirmed");
    assert.deepEqual(data.request.payments.map(({ purpose, amount }) => ({ purpose, amount })), [{ purpose: "inspection", amount: 250000 }]);
    assert.equal((await PaymentEvent.findById(`paystack:${reference}`).lean()).outcome, "applied");
    assert.deepEqual(provider.verified, [reference]);
  });

  it("is safe to call again: the payment is applied once", async () => {
    const { p, id, reference } = await paidStarted();
    await confirm(id, p.homeowner, reference).expect(200);
    assert.equal((await confirm(id, p.homeowner, reference).expect(200)).body.data.outcome, "applied");
    assert.equal((await Booking.findById(id)).verifiedPayments.length, 1);
    assert.equal((await events(id)).length, 1);
  });

  it("changes nothing while Paystack says the payment is not successful", async () => {
    for (const status of ["ongoing", "pending", "abandoned", "failed", "reversed"]) {
      const { p, id, reference } = await started();
      provider.verify = (answer) => ({ ...answer, status });
      const data = (await confirm(id, p.homeowner, reference).expect(200)).body.data;
      assert.equal(data.status, status);
      assert.equal(data.outcome, null);
      assert.equal(data.request.status, "awaiting_inspection_payment");
      assert.equal((await events(id)).length, 0);
    }
  });

  it("records a different amount or currency for support at what was actually paid, and never books it", async () => {
    for (const change of [{ amount: 100 }, { currency: "USD" }]) {
      const { p, id, reference } = await paidStarted();
      provider.verify = (answer) => ({ ...answer, ...change });
      const data = (await confirm(id, p.homeowner, reference).expect(200)).body.data;
      assert.equal(data.outcome, "reconciliation_required");
      assert.equal(data.request.status, "awaiting_inspection_payment");
      const [event] = await events(id);
      assert.equal(event._id, `paystack:${reference}`);
      assert.equal(event.outcome, "reconciliation_required");
      assert.equal(event.amount, change.amount ?? 250000);
      assert.equal(event.currency, change.currency ?? "NGN");
      assert.match(event.reason, /different amount or currency/);
    }
  });

  it("trusts nothing when Paystack answers for another transaction", async () => {
    const { p, id, reference } = await paidStarted();
    provider.verify = (answer) => ({ ...answer, reference: "fx-other" });
    assert.equal((await confirm(id, p.homeowner, reference).expect(502)).body.code, "PAYMENT_PROVIDER_ERROR");
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
    assert.equal((await events(id)).length, 0);
  });

  it("records a payment the booking's obligation no longer matches, instead of dropping it", async () => {
    const { p, id, reference } = await paidStarted();
    // Our attempt and Paystack agree, but the booking expects a different amount.
    await PaymentAttempt.updateOne({ _id: reference }, { amount: 260000 });
    const data = (await confirm(id, p.homeowner, reference).expect(200)).body.data;
    assert.equal(data.outcome, "reconciliation_required");
    assert.equal(data.request.status, "awaiting_inspection_payment");
    const [event] = await events(id);
    assert.equal(event.amount, 260000);
    assert.match(event.reason, /different amount or currency/);
  });

  it("only takes the request and purpose from our stored attempt", async () => {
    const { p, id, reference } = await paidStarted();
    const other = await paidStarted();
    assert.equal((await confirm(id, p.homeowner, other.reference).expect(404)).body.code, "PAYMENT_NOT_FOUND");
    provider.verify = (answer) => ({ ...answer, metadata: { requestId: other.id, purpose: "repair_balance" } });
    const data = (await confirm(id, p.homeowner, reference).expect(200)).body.data;
    assert.equal(data.request.id, id);
    assert.equal(data.purpose, "inspection");
    assert.equal((await Booking.findById(other.id)).status, "awaiting_inspection_payment");
  });

  it("rejects unknown and malformed references before asking Paystack", async () => {
    const { p, id } = await started();
    assert.equal((await confirm(id, p.homeowner, `fx-ins-${id}-000000000000`).expect(404)).body.code, "PAYMENT_NOT_FOUND");
    for (const bad of ["abc", `fx-xyz-${id}-000000000000`, "fx-ins-..%2F..%2Fx-000000000000", `paystack:fx-ins-${id}-000000000000`]) {
      assert.equal((await confirm(id, p.homeowner, encodeURIComponent(bad)).expect(400)).body.code, "INVALID_PAYMENT_REFERENCE");
    }
    assert.deepEqual(provider.verified, []);
  });

  it("only lets the homeowner confirm, and hides the request from strangers", async () => {
    const { p, id, reference } = await paidStarted();
    await confirm(id, p.artisan, reference).expect(403);
    await confirm(id, await user(), reference).expect(404);
    assert.deepEqual(provider.verified, []);
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
  });

  it("flags a payment confirmed after the deadline for reconciliation instead of booking it", async (t) => {
    const { p, id, reference } = await paidStarted();
    const { inspection } = await Booking.findById(id);
    t.mock.timers.setTime(inspection.paymentDeadline.getTime() + 1);
    const data = (await confirm(id, p.homeowner, reference).expect(200)).body.data;
    assert.equal(data.outcome, "reconciliation_required");
    assert.equal(data.request.status, "inspection_payment_expired");
  });

  it("passes Paystack failures through as a 502 and changes nothing", async () => {
    const { p, id, reference } = await paidStarted();
    provider.fail = Object.assign(new Error("The payment provider could not complete this request. Please try again."),
      { statusCode: 502, code: "PAYMENT_PROVIDER_ERROR" });
    assert.equal((await confirm(id, p.homeowner, reference).expect(502)).body.code, "PAYMENT_PROVIDER_ERROR");
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
  });
});

describe("never losing or double-taking money", () => {
  it("settles a paid checkout whose confirmation was lost instead of charging again", async (t) => {
    const { p, id, reference } = await started();
    provider.paid.add(reference); // paid, but the tab closed before the page could confirm
    t.mock.timers.setTime(Date.now() + 16 * minute);
    const res = await pay(id, p.homeowner).expect(409);
    assert.equal(res.body.code, "PAYMENT_ALREADY_MADE");
    assert.equal(provider.calls.length, 1, "no second checkout was started");
    assert.equal((await Booking.findById(id)).status, "inspection_confirmed");
    assert.equal((await PaymentEvent.findById(`paystack:${reference}`).lean()).outcome, "applied");
  });

  it("still lets the homeowner pay when an earlier paid checkout could not count", async (t) => {
    const { p, id, reference } = await started();
    provider.paid.add(reference);
    provider.verify = (answer) => (answer.reference === reference ? { ...answer, amount: 100 } : answer);
    t.mock.timers.setTime(Date.now() + 16 * minute);
    const next = (await pay(id, p.homeowner).expect(201)).body.data;
    assert.notEqual(next.reference, reference);
    assert.equal(next.amount, 250000);
    const event = await PaymentEvent.findById(`paystack:${reference}`).lean();
    assert.equal(event.outcome, "reconciliation_required");
    assert.equal(event.amount, 100);
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
  });

  it("checks unsettled earlier checkouts before reusing one, and skips ones already settled", async (t) => {
    const { p, id, reference } = await started();
    await pay(id, p.homeowner).expect(201);
    assert.deepEqual(provider.verified, [reference]);
    t.mock.timers.setTime(Date.now() + 16 * minute);
    const second = (await pay(id, p.homeowner).expect(201)).body.data.reference;
    assert.notEqual(second, reference);
    provider.verified = [];
    // Both left unpaid: each new click asks about both.
    await pay(id, p.homeowner).expect(201);
    assert.deepEqual(new Set(provider.verified), new Set([reference, second]));
  });

  it("records a second checkout paid in another tab for reconciliation, never booking twice", async (t) => {
    const { p, id, reference } = await started();
    t.mock.timers.setTime(Date.now() + 16 * minute);
    const second = (await pay(id, p.homeowner).expect(201)).body.data.reference;
    // Both tabs paid before either confirmed.
    provider.paid.add(reference);
    provider.paid.add(second);
    assert.equal((await confirm(id, p.homeowner, reference).expect(200)).body.data.outcome, "applied");
    const data = (await confirm(id, p.homeowner, second).expect(200)).body.data;
    assert.equal(data.outcome, "reconciliation_required");
    assert.equal(data.request.status, "inspection_confirmed");
    assert.equal((await Booking.findById(id)).verifiedPayments.length, 1);
    const event = await PaymentEvent.findById(`paystack:${second}`).lean();
    assert.equal(event.outcome, "reconciliation_required");
    assert.match(event.reason, /stopped waiting for this payment/);
    assert.equal((await confirm(id, p.homeowner, second).expect(200)).body.data.outcome, "reconciliation_required");
    assert.equal((await events(id)).length, 2);
  });

  it("limits payment calls per user", async () => {
    process.env.PAYMENT_RATE_LIMIT_MAX = "3";
    try {
      const { p, id } = await started();
      await pay(id, p.homeowner).expect(201);
      await pay(id, p.homeowner).expect(201);
      const res = await pay(id, p.homeowner).expect(429);
      assert.match(res.body.message, /Too many payment attempts/);
    } finally { delete process.env.PAYMENT_RATE_LIMIT_MAX; }
  });
});

describe("applyVerifiedPayment", () => {
  it("records a payment for reconciliation instead of leaving its receipt stuck when the reservation is not live", async () => {
    const p = await pair();
    const id = await accepted(p);
    // Inconsistent stage data: still waiting for payment, but the slot is no longer "reserved".
    await Booking.updateOne({ _id: id }, { $set: { "inspection.state": "confirmed" } });
    const externalReference = `test:${randomUUID()}`;
    const result = await applyVerifiedPayment({ requestId: id, purpose: "inspection", amount: 250000, currency: "NGN", externalReference });
    assert.equal(result.outcome, "reconciliation_required");
    assert.equal((await PaymentEvent.findById(externalReference)).outcome, "reconciliation_required");
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
  });
});
