import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fakePaystack, providerFailure, sign } from "./helpers/fakePaystack.js";
import { paymentTestSetup } from "./helpers/paymentSetup.js";

const {
  app, request, Booking, PaymentEvent, PaymentAttempt, paymentProvider, flushDetached,
  auth, user, pair, accepted, checkout, confirm, eventFor,
} = await paymentTestSetup("fixly-refund-tests-only");
const { requestRefund } = await import("../src/services/payments/refunds.js");
const { sweepPayments } = await import("../src/services/payments/sweep.js");
const { paymentReference } = await import("../src/services/payments/checkout.js");
const { assertNoBookingObligations } = await import("../src/services/requests/rules.js");

let provider;
beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  provider = fakePaystack(t, { paymentProvider, PaymentAttempt, PaymentEvent });
});
afterEach(() => flushDetached());

const minute = 60000;
const later = (t, ms) => t.mock.timers.setTime(Date.now() + ms);
// A homeowner who paid after the booking's payment deadline: recorded for reconciliation, not booked.
const latePayment = async (t, { flush = true } = {}) => {
  const p = await pair();
  const id = await accepted(p);
  const reference = await checkout(p, id);
  const booking = await Booking.findById(id);
  t.mock.timers.setTime(booking.inspection.paymentDeadline.getTime() + 1);
  provider.paid.add(reference);
  const res = await confirm(p, id, reference).expect(200);
  assert.equal(res.body.data.outcome, "reconciliation_required");
  if (flush) await flushDetached();
  return { p, id, reference };
};
const refundHook = (reference, event = "refund.processed", data = {}) => {
  const raw = JSON.stringify({ event, data: { transaction_reference: reference, status: "processed", amount: 1, currency: "NGN", ...data } });
  return request(app).post("/api/v1/payments/paystack/webhook").set("Content-Type", "application/json")
    .set("x-paystack-signature", sign(Buffer.from(raw))).send(raw);
};
const supportQueue = async (admin) => (await request(app).get("/api/v1/admin/support/payments").set(auth(admin)).expect(200)).body.data;
const resolveByHand = (admin, reference) => request(app).post("/api/v1/admin/support/payments/resolve").set(auth(admin)).send({
  paymentReference: `paystack:${reference}`, disposition: "externally_refunded", note: "Refunded from the Paystack dashboard",
  resolutionReference: "manual-1",
});

describe("automatic refunds: starting one", () => {
  it("refunds a late payment in full, once, even when several triggers race", async (t) => {
    const { reference } = await latePayment(t, { flush: false });
    const id = `paystack:${reference}`;
    await Promise.all([requestRefund(id), requestRefund(id), requestRefund(id), flushDetached()]);
    assert.equal(provider.refundCalls.length, 1);
    assert.equal(provider.refundCalls[0].reference, reference);
    const event = await eventFor(reference);
    assert.equal(event.refund.state, "pending");
    assert.equal(event.refund.amount, 250000);
    assert.equal(event.refund.providerRefundId, 5000);
    assert.equal(event.resolution, undefined);
  });

  it("refunds the amount actually paid when it differs from the checkout", async () => {
    const p = await pair();
    const id = await accepted(p);
    const reference = await checkout(p, id);
    provider.paid.add(reference);
    provider.verify = (answer) => ({ ...answer, amount: 300000 });
    await confirm(p, id, reference).expect(200);
    await flushDetached();
    const event = await eventFor(reference);
    assert.equal(event.amount, 300000);
    assert.equal(event.refund.amount, 300000);
    assert.equal(provider.refundCalls.length, 1);
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
  });

  it("refunds a second payment for something already paid, and keeps the first", async () => {
    const p = await pair();
    const id = await accepted(p);
    const first = await checkout(p, id);
    const second = paymentReference(id, "inspection");
    await PaymentAttempt.create({ _id: second, provider: "paystack", requestId: id, homeowner: p.homeowner.id,
      purpose: "inspection", amount: 250000, currency: "NGN", accessCode: "ac_second" });
    provider.paid.add(first); provider.paid.add(second);
    await confirm(p, id, first).expect(200);
    await confirm(p, id, second).expect(200);
    await flushDetached();
    assert.equal((await eventFor(first)).outcome, "applied");
    assert.equal((await eventFor(first)).refund, undefined);
    assert.equal((await eventFor(second)).refund.state, "pending");
    assert.deepEqual(provider.refundCalls.map((call) => call.reference), [second]);
    assert.equal((await Booking.findById(id)).status, "inspection_confirmed");
  });

  it("never refunds an applied payment, a resolved one, or one that did not come from our Paystack checkout", async (t) => {
    const p = await pair();
    const id = await accepted(p);
    const reference = await checkout(p, id);
    provider.paid.add(reference);
    await confirm(p, id, reference).expect(200);
    assert.equal(await requestRefund(`paystack:${reference}`), null);
    const base = { requestId: id, homeowner: p.homeowner.id, artisan: p.artisan.id, purpose: "inspection", amount: 1, currency: "NGN",
      outcome: "reconciliation_required" };
    await PaymentEvent.create({ ...base, _id: "simulated:abc" });
    await PaymentEvent.create({ ...base, _id: "paystack:T123" });
    for (const eventId of ["simulated:abc", "paystack:T123", "paystack:fx-ins-zz", 42, undefined]) assert.equal(await requestRefund(eventId), null);
    later(t, 5 * minute);
    await sweepPayments();
    assert.equal(provider.refundCalls.length, 0);
  });
});

describe("automatic refunds: when Paystack does not answer clearly", () => {
  it("leaves an unclear failure for the sweep, which adopts a refund Paystack did create instead of sending another", async (t) => {
    provider.refundFail = providerFailure(0, "Request timed out");
    provider.refundCreatesFirst = true;
    const { reference } = await latePayment(t);
    assert.equal((await eventFor(reference)).refund.state, "requesting");

    later(t, 5 * minute);
    await sweepPayments();
    assert.equal(provider.refundCalls.length, 1, "not retried before it is stale");

    provider.refundFail = null;
    later(t, 6 * minute);
    await sweepPayments();
    assert.equal(provider.refundCalls.length, 1, "adopted, not sent again");
    const event = await eventFor(reference);
    assert.equal(event.refund.state, "pending");
    assert.equal(event.refund.providerRefundId, 5000);
  });

  it("tries again when Paystack has no refund, and hands over to an admin after 3 tries", async (t) => {
    provider.refundFail = providerFailure(503, "Service unavailable");
    const { reference } = await latePayment(t);
    for (let i = 0; i < 3; i += 1) { later(t, 11 * minute); await sweepPayments(); }
    assert.equal(provider.refundCalls.length, 3);
    const event = await eventFor(reference);
    assert.equal(event.refund.state, "needs_attention");
    assert.equal(event.refund.tries, 3);
    later(t, 11 * minute);
    await sweepPayments();
    assert.equal(provider.refundCalls.length, 3, "no more tries");
  });

  it("marks a refund Paystack refuses as failed only when no refund exists for the payment", async (t) => {
    provider.refundFail = providerFailure(400, "Transaction has been fully reversed");
    provider.refundCreatesFirst = true;
    const { reference: adopted } = await latePayment(t);
    assert.equal((await eventFor(adopted)).refund.state, "pending");

    provider.refundCreatesFirst = false;
    const { reference: refused } = await latePayment(t);
    const event = await eventFor(refused);
    assert.equal(event.refund.state, "failed");
    assert.match(event.refund.failureReason, /fully reversed/);
  });
});

describe("automatic refunds: finishing one", () => {
  it("resolves the payment once Paystack's own record says processed, and unblocks the accounts", async (t) => {
    const admin = await user("admin");
    const { p, reference } = await latePayment(t);
    await assert.rejects(assertNoBookingObligations(p.homeowner._id), /unresolved/);
    assert.ok((await supportQueue(admin)).some((item) => item._id === `paystack:${reference}`));

    provider.setRefundStatus("processed");
    await refundHook(reference).expect(200);
    const event = await eventFor(reference);
    assert.equal(event.refund.state, "processed");
    assert.ok(event.refund.processedAt);
    assert.equal(event.resolution.disposition, "externally_refunded");
    assert.equal(event.resolution.resolutionReference, "paystack-refund:5000");
    assert.equal(event.resolution.automatic, true);
    assert.equal(event.outcome, "reconciliation_required");
    assert.ok(!(await supportQueue(admin)).some((item) => item._id === `paystack:${reference}`));
    await assertNoBookingObligations(p.homeowner._id);
  });

  it("trusts Paystack's API, never the webhook payload", async (t) => {
    const { reference } = await latePayment(t);
    await refundHook(reference).expect(200); // payload says processed, Paystack says pending
    assert.equal((await eventFor(reference)).refund.state, "pending");
    assert.equal((await eventFor(reference)).resolution, undefined);
    await refundHook("fx-ins-aaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaa").expect(200);
    await refundHook("T99").expect(200);
  });

  it("needs an admin when Paystack refunded a different amount", async (t) => {
    const { reference } = await latePayment(t);
    provider.setRefundStatus("processed");
    provider.fetchRefund = (refund) => ({ ...refund, amount: 1000 });
    await refundHook(reference).expect(200);
    const event = await eventFor(reference);
    assert.equal(event.refund.state, "needs_attention");
    assert.equal(event.resolution, undefined);
  });

  it("keeps a failed refund in the support queue", async (t) => {
    const admin = await user("admin");
    const { reference } = await latePayment(t);
    provider.setRefundStatus("failed");
    await refundHook(reference, "refund.failed").expect(200);
    assert.equal((await eventFor(reference)).refund.state, "failed");
    assert.ok((await supportQueue(admin)).some((item) => item._id === `paystack:${reference}`));
  });

  it("polls a pending refund whose webhook never came", async (t) => {
    const { reference } = await latePayment(t);
    provider.setRefundStatus("processed");
    later(t, 30 * minute);
    await sweepPayments();
    assert.equal((await eventFor(reference)).refund.state, "pending", "polled again only after an hour");
    later(t, 31 * minute);
    await sweepPayments();
    assert.equal((await eventFor(reference)).refund.state, "processed");
  });
});

describe("automatic refunds: admins", () => {
  it("cannot resolve by hand while a refund is in flight, and can once it failed", async (t) => {
    const admin = await user("admin");
    const { reference } = await latePayment(t);
    const blocked = await resolveByHand(admin, reference).expect(409);
    assert.match(blocked.body.message, /automatic refund is in progress/);
    provider.setRefundStatus("failed");
    await refundHook(reference, "refund.failed").expect(200);
    await resolveByHand(admin, reference).expect(200);
    const event = await eventFor(reference);
    assert.equal(event.resolution.resolutionReference, "manual-1");
    assert.equal(event.resolution.resolvedBy.toString(), admin.id);
  });

  it("never starts a refund for a payment an admin already resolved", async (t) => {
    const admin = await user("admin");
    provider.refundFail = providerFailure(400, "Refused");
    const { reference } = await latePayment(t);
    await resolveByHand(admin, reference).expect(200);
    await PaymentEvent.updateOne({ _id: `paystack:${reference}` }, { $unset: { refund: 1 } });
    provider.refundFail = null;
    assert.equal(await requestRefund(`paystack:${reference}`), null);
    later(t, 5 * minute);
    await sweepPayments();
    assert.equal(provider.refundCalls.length, 1);
  });
});
