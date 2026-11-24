import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fakePaystack, providerFailure } from "./helpers/fakePaystack.js";
import { paymentTestSetup } from "./helpers/paymentSetup.js";

const { Booking, PaymentEvent, PaymentAttempt, paymentProvider, flushDetached, pair, accepted, eventFor } =
  await paymentTestSetup("fixly-sweep-tests-only");
const { sweepPayments } = await import("../src/services/payments/sweep.js");
const { paymentReference } = await import("../src/services/payments/checkout.js");

let provider;
// The sweep looks at every checkout, so each test starts with none left over from the others.
beforeEach(async (t) => {
  await Promise.all([PaymentAttempt.deleteMany({}), PaymentEvent.deleteMany({})]);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  provider = fakePaystack(t, { paymentProvider, PaymentAttempt, PaymentEvent });
});
afterEach(() => flushDetached());

const minute = 60000;
const later = (t, ms) => t.mock.timers.setTime(Date.now() + ms);
// Checkouts made directly, as many as a test needs, with no popup involved.
const attempts = async (p, id, count, { createdAt } = {}) => {
  const made = [];
  for (let i = 0; i < count; i += 1) {
    made.push((await PaymentAttempt.create({ _id: paymentReference(id, "inspection"), provider: "paystack", requestId: id,
      homeowner: p.homeowner.id, purpose: "inspection", amount: 250000, currency: "NGN", accessCode: `ac_${i}`,
      ...(createdAt ? { createdAt } : {}) }))._id);
  }
  return made;
};
const booking = async () => { const p = await pair(); return { p, id: await accepted(p) }; };

describe("payment sweep", () => {
  it("settles a paid checkout that neither the popup nor the webhook reported, beyond checkout's re-check of 5", async (t) => {
    const { p, id } = await booking();
    const [oldest, ...rest] = await attempts(p, id, 6);
    assert.equal(rest.length, 5);
    provider.paid.add(oldest);
    later(t, 3 * minute);
    const result = await sweepPayments();
    assert.equal(result.settled, 6);
    assert.equal((await eventFor(oldest)).outcome, "applied");
    assert.equal((await Booking.findById(id)).status, "inspection_confirmed");
    assert.ok((await PaymentAttempt.findById(oldest)).settledAt);
  });

  it("leaves brand-new checkouts alone, and stops checking settled or very old ones", async (t) => {
    const { p, id } = await booking();
    const [fresh] = await attempts(p, id, 1);
    await sweepPayments();
    assert.equal(provider.verified.length, 0, "too fresh");

    provider.paid.add(fresh);
    later(t, 3 * minute);
    await sweepPayments();
    assert.deepEqual(provider.verified, [fresh]);
    later(t, 3 * minute);
    await sweepPayments();
    assert.deepEqual(provider.verified, [fresh], "settled: not asked again");

    const other = await booking();
    await attempts(other.p, other.id, 1, { createdAt: new Date(Date.now() - 73 * 60 * minute) });
    await sweepPayments();
    assert.deepEqual(provider.verified, [fresh], "older than 72 hours");
  });

  it("checks at most 25 checkouts a pass, least recently checked first", async (t) => {
    const { p, id } = await booking();
    const made = await attempts(p, id, 30);
    later(t, 3 * minute);
    await sweepPayments();
    assert.equal(provider.verified.length, 25);
    later(t, minute);
    await sweepPayments();
    const second = provider.verified.slice(25, 30);
    assert.deepEqual(new Set(second), new Set(made.filter((ref) => !provider.verified.slice(0, 25).includes(ref))));
  });

  it("keeps going past a checkout Paystack cannot answer for", async (t) => {
    const { p, id } = await booking();
    const [first, second] = await attempts(p, id, 2);
    provider.paid.add(second);
    provider.verify = (answer) => { if (answer.reference === first) throw providerFailure(500, "Boom"); return answer; };
    later(t, 3 * minute);
    await sweepPayments();
    assert.equal((await eventFor(second)).outcome, "applied");
    assert.equal(await eventFor(first), null);
    assert.ok((await PaymentAttempt.findById(first)).checkedAt);
  });

  it("starts a refund the charge path never started", async (t) => {
    const { p, id } = await booking();
    const [reference] = await attempts(p, id, 1);
    await PaymentEvent.create({ _id: `paystack:${reference}`, requestId: id, homeowner: p.homeowner.id, artisan: p.artisan.id,
      purpose: "inspection", amount: 250000, currency: "NGN", outcome: "reconciliation_required", reason: "late" });
    await sweepPayments();
    assert.equal(provider.refundCalls.length, 0, "a fresh one is left to its own kick-off");
    later(t, 2 * minute);
    const result = await sweepPayments();
    assert.equal(result.started, 1);
    assert.equal((await eventFor(reference)).refund.state, "pending");
  });

  it("does nothing without a Paystack key", async (t) => {
    const { p, id } = await booking();
    await attempts(p, id, 1);
    later(t, 3 * minute);
    const key = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = "";
    try { assert.deepEqual(await sweepPayments(), { skipped: true }); }
    finally { process.env.PAYSTACK_SECRET_KEY = key; }
    assert.equal(provider.verified.length, 0);
  });
});
