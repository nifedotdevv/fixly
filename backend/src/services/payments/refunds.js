import PaymentEvent from "../../models/paymentEvent.js";
import { paymentProvider } from "./paystack.js";
import { PROVIDER_PREFIX, isOurReference, providerReference } from "./references.js";

// Automatic refunds of Paystack charges that could not count towards a booking (late, duplicate, mismatched).
//
// Rules that keep a refund from ever being sent twice or lost:
// - Only the caller that atomically claims an event (refund absent, no resolution) asks Paystack for a refund.
// - Webhooks and sweeps only ever re-read Paystack's own record. Nothing in a webhook payload is trusted.
// - An unclear failure (timeout, 5xx) leaves the refund "requesting". Recovery first asks Paystack whether a
//   refund exists for that transaction, and only then tries again. After MAX_TRIES it waits for an admin.
// - "failed" is only set when Paystack refused and has no refund for the transaction, so an admin can safely
//   refund by hand. A manual resolution is refused while a refund is requesting, pending or processed.

const MAX_TRIES = 3;
export const STALE_REQUEST_MS = 10 * 60000;
// Refund states Paystack may still move. Ours are terminal once processed or failed.
const PROVIDER_OPEN = ["requesting", "pending", "needs_attention"];
const STATE_BY_PROVIDER = {
  pending: "pending", processing: "pending", processed: "processed", failed: "failed", "needs-attention": "needs_attention",
};
// Refunds are started for these events only. Simulator and test references are never refunded.
export const refundableFilter = {
  _id: { $regex: `^${PROVIDER_PREFIX}fx-` }, outcome: "reconciliation_required", resolution: { $exists: false },
};
const NOTE = "Fixly: this payment could not be applied to the booking";

const transactionReference = (event) => event._id.slice(PROVIDER_PREFIX.length);
// Paystack refused outright (bad request, already refunded...), so no refund was created by this call.
const refused = (error) => error?.code === "PAYMENT_PROVIDER_ERROR"
  && error.providerStatus >= 400 && error.providerStatus < 500 && error.providerStatus !== 429;

// Records Paystack's view of one refund. Only moves refunds that are still open, never a resolved event,
// and never swaps one Paystack refund for another.
const recordProviderRefund = async (event, refund, now) => {
  let state = STATE_BY_PROVIDER[refund.status] ?? "needs_attention";
  let failureReason;
  if (state === "processed" && (refund.amount !== event.amount || refund.currency !== event.currency)) {
    state = "needs_attention";
    failureReason = "Paystack refunded a different amount or currency than was paid.";
  } else if (state === "failed") failureReason = "Paystack reported that the refund failed.";
  else if (state === "needs_attention") failureReason = "Paystack needs action on this refund.";
  const set = {
    "refund.state": state, "refund.providerRefundId": refund.id, "refund.amount": refund.amount,
    "refund.currency": refund.currency, "refund.checkedAt": now, ...(failureReason ? { "refund.failureReason": failureReason } : {}),
  };
  if (state === "processed") {
    set["refund.processedAt"] = now;
    // The money is back with the homeowner: the event leaves the support queue and stops blocking the accounts.
    set.resolution = {
      disposition: "externally_refunded", resolutionReference: `paystack-refund:${refund.id}`,
      note: "Refunded automatically through Paystack.", automatic: true, resolvedAt: now,
    };
  }
  return PaymentEvent.findOneAndUpdate({
    _id: event._id, resolution: { $exists: false }, "refund.state": { $in: PROVIDER_OPEN },
    $or: [{ "refund.providerRefundId": { $exists: false } }, { "refund.providerRefundId": refund.id }],
  }, { $set: set }, { new: true });
};

const markRefund = (event, fromState, set) => PaymentEvent.findOneAndUpdate(
  { _id: event._id, resolution: { $exists: false }, "refund.state": fromState },
  { $set: Object.fromEntries(Object.entries(set).map(([key, value]) => [`refund.${key}`, value])) }, { new: true });

// A refund Paystack already holds for this event's transaction, or null when it has none.
const existingRefund = async (client, event) => {
  const reference = transactionReference(event);
  const transaction = await client.verify(reference);
  if (transaction.reference !== reference || !Number.isSafeInteger(transaction.id)) {
    throw Object.assign(new Error("Unexpected transaction from the payment provider"), { code: "PAYMENT_PROVIDER_ERROR", statusCode: 502 });
  }
  const refunds = await client.listRefunds(transaction.id);
  return refunds.find((refund) => refund.transactionId === transaction.id) ?? null;
};

// Sends the refund for an event this caller has claimed (state "requesting").
const sendRefund = async (client, event, now) => {
  let refund;
  try {
    refund = await client.refund({ reference: transactionReference(event), reason: NOTE });
  } catch (error) {
    if (!refused(error)) return event; // Unclear: stays "requesting" for recovery.
    // Refused, but a refund may already exist (for example from an earlier call that timed out).
    const existing = await existingRefund(client, event);
    if (existing) return recordProviderRefund(event, existing, now);
    return markRefund(event, "requesting", {
      state: "failed", failureReason: `Paystack refused the refund: ${String(error.providerMessage || error.message).slice(0, 200)}`,
    });
  }
  return recordProviderRefund(event, refund, now);
};

// Starts the refund for one event, at most once. Returns the updated event, or null when not refundable.
export const requestRefund = async (eventId, { now = new Date() } = {}) => {
  if (typeof eventId !== "string" || !eventId.startsWith(PROVIDER_PREFIX) || !isOurReference(eventId.slice(PROVIDER_PREFIX.length))) return null;
  // Before the claim, so a missing key never leaves a claimed refund that was not sent.
  const client = paymentProvider.client();
  const claimed = await PaymentEvent.findOneAndUpdate(
    { ...refundableFilter, _id: eventId, refund: { $exists: false } },
    { $set: { refund: { state: "requesting", requestedAt: now, lastTriedAt: now, tries: 1 } } },
    { new: true },
  );
  if (!claimed) return null;
  return sendRefund(client, claimed, now);
};

// A refund left "requesting" by an unclear failure: adopt Paystack's refund if it exists, else try again.
export const recoverRefund = async (event, { now = new Date(), client = paymentProvider.client() } = {}) => {
  if (event.refund?.state !== "requesting") return event;
  const existing = await existingRefund(client, event);
  if (existing) return recordProviderRefund(event, existing, now);
  if (event.refund.tries >= MAX_TRIES) {
    return markRefund(event, "requesting", {
      state: "needs_attention", failureReason: "Paystack did not confirm the refund after several tries. Check the Paystack dashboard.",
    });
  }
  // Claim the retry so two recoveries never send at once.
  const retry = await PaymentEvent.findOneAndUpdate(
    { _id: event._id, resolution: { $exists: false }, "refund.state": "requesting", "refund.tries": event.refund.tries },
    { $set: { "refund.lastTriedAt": now }, $inc: { "refund.tries": 1 } }, { new: true },
  );
  return retry ? sendRefund(client, retry, now) : null;
};

// Re-reads a refund Paystack already gave us an id for.
export const pollRefund = async (event, { now = new Date(), client = paymentProvider.client() } = {}) => {
  const id = event.refund?.providerRefundId;
  if (!id || !PROVIDER_OPEN.includes(event.refund.state)) return event;
  const refund = await client.fetchRefund(id);
  if (refund.id !== id) return event;
  return recordProviderRefund(event, refund, now);
};

// refund.* webhook: the payload only says which transaction to look at again. Paystack's API decides.
export const handleRefundWebhook = async (data, { now = new Date() } = {}) => {
  const reference = typeof data?.transaction_reference === "string" ? data.transaction_reference : data?.transaction?.reference;
  if (!isOurReference(reference)) return "ignored";
  const event = await PaymentEvent.findById(providerReference(reference));
  if (!event?.refund) return "ignored";
  if (event.refund.providerRefundId) return (await pollRefund(event, { now })) ? "checked" : "ignored";
  // Our refund call is still in flight or ended unclearly; leave fresh ones to the caller that sent it.
  if (event.refund.state === "requesting" && now - event.refund.lastTriedAt >= STALE_REQUEST_MS) {
    await recoverRefund(event, { now });
    return "checked";
  }
  return "ignored";
};
