import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fakePaystack, providerFailure, sign } from "./helpers/fakePaystack.js";
import { paymentTestSetup } from "./helpers/paymentSetup.js";

const {
  app, request, Booking, PaymentEvent, PaymentAttempt, paymentProvider, flushDetached, pair, accepted, checkout, confirm, eventFor,
} = await paymentTestSetup("fixly-webhook-tests-only");

const URL = "/api/v1/payments/paystack/webhook";
let provider;
beforeEach((t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  provider = fakePaystack(t, { paymentProvider, PaymentAttempt, PaymentEvent });
});
afterEach(() => flushDetached());

const body = (payload) => Buffer.from(JSON.stringify(payload));
const hook = (raw, signature = sign(raw)) => {
  const req = request(app).post(URL).set("Content-Type", "application/json");
  if (signature !== null) req.set("x-paystack-signature", signature);
  // A string goes out byte for byte; superagent would re-serialise a Buffer.
  return req.send(raw.toString("utf8"));
};
// What Paystack would send. The fields we must not trust are deliberately wrong.
const charge = (reference, data = {}) => body({
  event: "charge.success",
  data: { reference, status: "success", amount: 1, currency: "USD", metadata: { requestId: "000000000000000000000000", purpose: "repair_balance" }, ...data },
});
const paidBooking = async () => {
  const p = await pair();
  const id = await accepted(p);
  const reference = await checkout(p, id);
  return { p, id, reference };
};

describe("Paystack webhook: who may call it", () => {
  it("refuses a missing, wrong or forged signature, or a changed body, and writes nothing", async () => {
    const { id, reference } = await paidBooking();
    provider.paid.add(reference);
    const raw = charge(reference);
    await hook(raw, null).expect(401);
    await hook(raw, "abc").expect(401);
    await hook(raw, sign(raw, "sk_test_someoneelse")).expect(401);
    await hook(Buffer.from(raw.toString().replace("charge.success", "charge.success ")), sign(raw)).expect(401);
    assert.equal(provider.verified.length, 0);
    assert.equal(await PaymentEvent.countDocuments({ requestId: id }), 0);
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
  });

  it("only reads the raw JSON body: another content type is refused", async () => {
    const raw = charge("fx-ins-aaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaa");
    await request(app).post(URL).set("Content-Type", "text/plain").set("x-paystack-signature", sign(raw)).send(raw.toString()).expect(401);
  });

  it("rejects a signed body that is not a JSON object", async () => {
    for (const raw of [Buffer.from("{not json"), Buffer.from("[1,2]"), Buffer.from("null")]) await hook(raw).expect(400);
  });

  it("refuses bodies over 64kb", async () => {
    const raw = body({ event: "charge.success", data: { padding: "x".repeat(70 * 1024) } });
    await hook(raw).expect(413);
  });

  it("answers 503 when payments are not configured, so Paystack retries later", async () => {
    const key = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = "";
    try { await hook(charge("fx-ins-aaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaa")).expect(503); }
    finally { process.env.PAYSTACK_SECRET_KEY = key; }
  });

  it("is not behind the API rate limiter or the JSON parser", async () => {
    const raw = body({ event: "subscription.create", data: {} });
    for (let i = 0; i < 3; i += 1) await hook(raw).expect(200);
  });
});

describe("Paystack webhook: charge.success", () => {
  it("applies the payment from Paystack's verify answer and our stored attempt, never the payload", async () => {
    const { id, reference } = await paidBooking();
    provider.paid.add(reference);
    await hook(charge(reference)).expect(200);
    assert.deepEqual(provider.verified, [reference]);
    const event = await eventFor(reference);
    assert.equal(event.outcome, "applied");
    assert.equal(event.amount, 250000);
    assert.equal(event.currency, "NGN");
    assert.equal(event.purpose, "inspection");
    const booking = await Booking.findById(id);
    assert.equal(booking.status, "inspection_confirmed");
    assert.ok((await PaymentAttempt.findById(reference)).settledAt);
  });

  it("changes nothing when the payload says success but Paystack's record does not", async () => {
    const { id, reference } = await paidBooking();
    await hook(charge(reference)).expect(200);
    assert.equal(await eventFor(reference), null);
    assert.equal((await Booking.findById(id)).status, "awaiting_inspection_payment");
  });

  it("acknowledges and ignores references that are not ours or are unknown, and other events", async () => {
    await hook(charge("T123456789")).expect(200);
    await hook(charge("fx-ins-aaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaa")).expect(200);
    await hook(charge(undefined)).expect(200);
    await hook(body({ event: "transfer.success", data: { reference: "fx-ins-aaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaa" } })).expect(200);
    assert.equal(provider.verified.length, 0);
  });

  it("is safe to replay: one payment, one booking change", async () => {
    const { id, reference } = await paidBooking();
    provider.paid.add(reference);
    const raw = charge(reference);
    await hook(raw).expect(200);
    await hook(raw).expect(200);
    assert.equal(await PaymentEvent.countDocuments({ requestId: id }), 1);
    assert.equal((await Booking.findById(id)).verifiedPayments.length, 1);
  });

  it("settles once when the webhook and the popup confirmation arrive together", async () => {
    const { p, id, reference } = await paidBooking();
    provider.paid.add(reference);
    const [hooked, confirmed] = await Promise.all([hook(charge(reference)), confirm(p, id, reference)]);
    assert.equal(hooked.status, 200);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(await PaymentEvent.countDocuments({ requestId: id }), 1);
    const booking = await Booking.findById(id);
    assert.equal(booking.verifiedPayments.length, 1);
    assert.equal(booking.status, "inspection_confirmed");
  });

  it("answers 500 when Paystack cannot be reached, so the retry applies it", async () => {
    const { id, reference } = await paidBooking();
    provider.paid.add(reference);
    provider.fail = providerFailure(0, "Request timed out");
    await hook(charge(reference)).expect(500);
    assert.equal(await eventFor(reference), null);
    provider.fail = null;
    await hook(charge(reference)).expect(200);
    assert.equal((await eventFor(reference)).outcome, "applied");
    assert.equal((await Booking.findById(id)).status, "inspection_confirmed");
  });

  it("records a payment that arrives after the deadline and refunds it automatically", async (t) => {
    const { id, reference } = await paidBooking();
    const booking = await Booking.findById(id);
    t.mock.timers.setTime(booking.inspection.paymentDeadline.getTime() + 1);
    provider.paid.add(reference);
    await hook(charge(reference)).expect(200);
    await flushDetached();
    const event = await eventFor(reference);
    assert.equal(event.outcome, "reconciliation_required");
    assert.equal(event.refund.state, "pending");
    assert.deepEqual(provider.refundCalls.map((call) => call.reference), [reference]);
    assert.notEqual((await Booking.findById(id)).status, "inspection_confirmed");
  });
});
