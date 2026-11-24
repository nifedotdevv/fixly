import PaymentAttempt from "../../models/paymentAttempt.js";
import PaymentEvent from "../../models/paymentEvent.js";
import { loadRequest } from "../requests/serviceRequests.js";
import { settleAttempt } from "./checkout.js";
import { STALE_REQUEST_MS, pollRefund, recoverRefund, refundableFilter, requestRefund } from "./refunds.js";
import { paymentProvider, paystackSettings } from "./paystack.js";
import { providerReference } from "./references.js";

// Safety net for anything the popup confirmation and the webhook both missed. Every step is bounded and
// idempotent, and each item is handled on its own so one failure never stops the rest.
const minute = 60000;
const ATTEMPT_WINDOW_MS = 72 * 60 * minute; // Paystack retries webhooks for up to 72 hours.
const FRESH_MS = 2 * minute;               // Leave brand-new checkouts to the popup and the webhook.
const POLL_PENDING_MS = 60 * minute;

const log = (step, error) => {
  if (process.env.NODE_ENV !== "test") console.error(`[payments] sweep ${step} failed: ${error?.name} ${error?.code ?? ""}`);
};
const each = async (items, step, work) => {
  let done = 0;
  for (const item of items) {
    try { await work(item); done += 1; } catch (error) { log(step, error); }
  }
  return done;
};

export const sweepPayments = async ({ now = new Date(), limit = 25 } = {}) => {
  try { paystackSettings(); } catch { return { skipped: true }; }
  const client = paymentProvider.client();
  const before = (ms) => new Date(now.getTime() - ms);

  // 1. Checkouts with no final outcome yet: ask Paystack and settle any that were paid.
  const attempts = await PaymentAttempt.find({
    settledAt: { $exists: false }, createdAt: { $gte: before(ATTEMPT_WINDOW_MS), $lte: before(FRESH_MS) },
  }).sort({ checkedAt: 1, createdAt: 1 }).limit(limit);
  const settled = await each(attempts, "settle", async (attempt) => {
    try {
      const event = await PaymentEvent.findById(providerReference(attempt._id)).select("outcome");
      if (event && event.outcome !== "processing") {
        await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { settledAt: now } });
        return;
      }
      const record = await loadRequest(attempt.requestId.toString());
      await settleAttempt(attempt, record, await client.verify(attempt._id));
    } finally {
      await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { checkedAt: now } });
    }
  });

  // 2. Refunds that were never started (for example the process stopped right after the charge was recorded).
  const unstarted = await PaymentEvent.find({ ...refundableFilter, refund: { $exists: false }, updatedAt: { $lte: before(minute) } })
    .sort({ createdAt: 1 }).limit(limit).select("_id");
  const started = await each(unstarted, "refund", (event) => requestRefund(event._id, { now }));

  // 3. Refunds that stopped moving: unclear sends, and pending ones whose webhook may have been missed.
  const stuck = await PaymentEvent.find({
    resolution: { $exists: false }, "refund.state": "requesting", "refund.lastTriedAt": { $lte: before(STALE_REQUEST_MS) },
  }).sort({ "refund.lastTriedAt": 1 }).limit(limit);
  const recovered = await each(stuck, "recover", (event) => recoverRefund(event, { now, client }));
  const pending = await PaymentEvent.find({
    resolution: { $exists: false }, "refund.state": "pending",
    $or: [{ "refund.checkedAt": { $exists: false } }, { "refund.checkedAt": { $lte: before(POLL_PENDING_MS) } }],
  }).sort({ "refund.checkedAt": 1 }).limit(limit);
  const polled = await each(pending, "poll", (event) => pollRefund(event, { now, client }));

  return { settled, started, recovered, polled };
};
