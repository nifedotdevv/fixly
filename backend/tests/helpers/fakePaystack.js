import crypto from "node:crypto";

// Tests must never reach the real Paystack, even from background work that outlives a test's mock.
globalThis.fetch = async () => { throw new Error("Network access is disabled in tests"); };

export const TEST_KEY = "sk_test_fixlyunit";
export const sign = (raw, key = TEST_KEY) => crypto.createHmac("sha512", key).update(raw).digest("hex");
export const providerFailure = (providerStatus, providerMessage = "Provider failure") => Object.assign(
  new Error("The payment provider could not complete this request. Please try again."),
  { statusCode: 502, code: "PAYMENT_PROVIDER_ERROR", providerStatus, providerMessage },
);

// In-memory Paystack. A reference in `paid` was paid in full; any other was opened and left.
// Hooks: `fail` (every call), `verify(answer)` rewrites a verify answer, `refundFail` makes refund() throw
// (with `refundCreatesFirst` it records the refund before throwing, like a timeout after Paystack acted),
// and `fetchRefund(view)` rewrites a fetched refund.
export const fakePaystack = (t, { paymentProvider, PaymentAttempt, PaymentEvent }) => {
  const provider = {
    calls: [], fail: null, verified: [], verify: null, paid: new Set(),
    refunds: [], refundCalls: [], refundFail: null, refundCreatesFirst: false, fetchRefund: null,
  };
  const ids = new Map();
  const transactionId = (reference) => {
    if (!ids.has(reference)) ids.set(reference, 1000 + ids.size);
    return ids.get(reference);
  };
  const view = (refund) => ({ id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency, transactionId: refund.transactionId });
  provider.transactionId = transactionId;
  provider.setRefundStatus = (status) => { for (const refund of provider.refunds) refund.status = status; };

  t.mock.method(paymentProvider, "client", () => ({
    initialize: async (input) => {
      provider.calls.push(input);
      if (provider.fail) throw provider.fail;
      return { accessCode: `ac_${provider.calls.length}`, authorizationUrl: "https://checkout.example.test", reference: input.reference };
    },
    verify: async (reference) => {
      provider.verified.push(reference);
      if (provider.fail) throw provider.fail;
      const attempt = await PaymentAttempt.findById(reference).lean();
      const answer = { id: transactionId(reference), reference, status: provider.paid.has(reference) ? "success" : "abandoned",
        amount: attempt?.amount, currency: attempt?.currency, paidAt: null, channel: "card", metadata: {} };
      return provider.verify ? provider.verify(answer) : answer;
    },
    refund: async ({ reference, reason }) => {
      provider.refundCalls.push({ reference, reason });
      if (provider.fail) throw provider.fail;
      const create = async () => {
        const event = await PaymentEvent.findById(`paystack:${reference}`).lean();
        const refund = { id: 5000 + provider.refunds.length, status: "pending", amount: event.amount, currency: event.currency,
          transactionId: transactionId(reference) };
        provider.refunds.push(refund);
        return refund;
      };
      if (provider.refundFail) {
        if (provider.refundCreatesFirst) await create();
        throw provider.refundFail;
      }
      return view(await create());
    },
    fetchRefund: async (id) => {
      if (provider.fail) throw provider.fail;
      const refund = provider.refunds.find((item) => item.id === id);
      if (!refund) throw providerFailure(404, "Refund not found");
      return provider.fetchRefund ? provider.fetchRefund(view(refund)) : view(refund);
    },
    listRefunds: async (id) => {
      if (provider.fail) throw provider.fail;
      return provider.refunds.filter((refund) => refund.transactionId === id).map(view);
    },
  }));
  return provider;
};
