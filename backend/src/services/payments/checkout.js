import { randomBytes } from "node:crypto";
import PaymentAttempt from "../../models/paymentAttempt.js";
import PaymentEvent from "../../models/paymentEvent.js";
import { AccountLifecycleConflictError, isDuplicateKey } from "../../utils/errors.js";
import User from "../../models/users.js";
import { REQUEST_STATUS as S } from "../../constants/serviceRequests.js";
import { assertEligibleParticipants, assertParticipant, loadRequest } from "../requests/serviceRequests.js";
import { effectiveStatus, requestView, requireCondition } from "../requests/rules.js";
import { applyVerifiedPayment, expectedPayment } from "../requests/verifiedPayments.js";
import { withParticipants } from "../requests/participants.js";
import { paymentProvider } from "./paystack.js";
import { isOurReference, providerReference } from "./references.js";
import { requestRefund } from "./refunds.js";
import { dispatchDetached } from "../backgroundTask.js";

// The stage decides what is being paid for; the browser never sends a purpose or an amount.
const PURPOSE_BY_STATUS = {
  [S.AWAITING_INSPECTION_PAYMENT]: "inspection",
  [S.AWAITING_REPAIR_DEPOSIT]: "repair_deposit",
  [S.AWAITING_FINAL_PAYMENT]: "repair_balance",
};
const SHORT = { inspection: "ins", repair_deposit: "dep", repair_balance: "bal" };
// An open attempt is reused for repeat clicks inside this window instead of starting another checkout.
const REUSE_MS = 15 * 60000;
// Refuse to start a checkout that the homeowner could not finish before the reservation lapses.
const MIN_TIME_LEFT_MS = 2 * 60000;

export const paymentReference = (requestId, purpose) => `fx-${SHORT[purpose]}-${requestId}-${randomBytes(6).toString("hex")}`;

const deadlineFor = (record, purpose) => {
  if (purpose === "inspection") return record.inspection?.paymentDeadline;
  if (purpose === "repair_deposit") return record.repair?.paymentDeadline;
  return null;
};

const attemptView = (attempt, paymentDeadline) => ({
  reference: attempt._id, accessCode: attempt.accessCode, purpose: attempt.purpose,
  amount: attempt.amount, currency: attempt.currency, paymentDeadline: paymentDeadline ?? null,
});

// How many earlier unsettled checkouts are checked with Paystack before a new one may start.
const RECHECK_LIMIT = 5;

// --- Money Paystack took that cannot move the booking ---------------------------------------------------------
// Every successful charge ends up as a PaymentEvent: applied, or reconciliation_required for support and refund.
// None is ever dropped, and none of these paths can advance a booking.
const REASONS = {
  notEligible: "Paid when the booking was no longer waiting for this payment (for example a second checkout). Support reconciliation or a refund is required.",
  amount: "The provider reported a different amount or currency than the checkout that was started. Support reconciliation or a refund is required.",
};
const recordUnapplied = async (attempt, record, { amount = attempt.amount, currency = attempt.currency, reason }) => {
  const _id = providerReference(attempt._id);
  try {
    await PaymentEvent.create({
      _id, requestId: record._id, homeowner: record.homeowner, artisan: record.artisan, purpose: attempt.purpose,
      amount, currency, outcome: "reconciliation_required", reason,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  return (await PaymentEvent.findById(_id)).outcome;
};

// The webhook and the popup confirmation often arrive together; the account lock refuses the second at once.
// Wait briefly and try again rather than failing the homeowner's confirmation. Bounded at about a second.
const LOCK_RETRY_MS = [100, 250, 600];
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const applyWhenFree = async (input) => {
  for (let attempt = 0; ; attempt += 1) {
    try { return await applyVerifiedPayment(input); }
    catch (error) {
      if (!(error instanceof AccountLifecycleConflictError) || attempt >= LOCK_RETRY_MS.length) throw error;
      await pause(LOCK_RETRY_MS[attempt]);
    }
  }
};

// Applies a provider-verified attempt at the attempt's own amount. Shared by checkout, confirmation and the webhook.
const applyPaidAttempt = async (attempt, record) => {
  try {
    const { outcome } = await applyWhenFree({
      requestId: attempt.requestId.toString(), purpose: attempt.purpose, amount: attempt.amount,
      currency: attempt.currency, externalReference: providerReference(attempt._id),
    });
    return outcome;
  } catch (error) {
    if (error.code === "PAYMENT_NOT_ELIGIBLE") return recordUnapplied(attempt, record, { reason: REASONS.notEligible });
    if (error.code === "PAYMENT_AMOUNT_MISMATCH") return recordUnapplied(attempt, record, { reason: REASONS.amount });
    throw error;
  }
};

const settleFromTransaction = async (attempt, record, transaction) => {
  if (transaction.amount !== attempt.amount || transaction.currency !== attempt.currency) {
    return recordUnapplied(attempt, record, { amount: transaction.amount, currency: transaction.currency, reason: REASONS.amount });
  }
  return applyPaidAttempt(attempt, record);
};

// Settles one attempt from Paystack's own transaction record. Returns our outcome, or null while not paid.
// Shared by checkout, confirmation, the webhook and the sweep.
export const settleAttempt = async (attempt, record, transaction) => {
  if (transaction.status !== "success") return null;
  // Paystack answered for another transaction than the one asked about: nothing about it can be trusted.
  requireCondition(transaction.reference === attempt._id, "The payment provider returned an unexpected transaction. Please try again.",
    502, "PAYMENT_PROVIDER_ERROR");
  const outcome = await settleFromTransaction(attempt, record, transaction);
  if (outcome === "applied" || outcome === "reconciliation_required") {
    await PaymentAttempt.updateOne({ _id: attempt._id, settledAt: { $exists: false } }, { $set: { settledAt: new Date() } });
  }
  // Money that could not count goes back automatically. The sweep starts any refund this misses.
  if (outcome === "reconciliation_required") {
    dispatchDetached(() => requestRefund(providerReference(attempt._id)), "Paystack refund");
  }
  return outcome;
};

const settled = (attempt) => PaymentEvent.exists({ _id: providerReference(attempt._id) });

// --- Start a checkout -------------------------------------------------------------------------------------------

// Starts (or resumes) the checkout for whatever the request is waiting on. Homeowner only.
export const startPayment = async (id, actorId, _input, { now = new Date() } = {}) => {
  const record = await loadRequest(id);
  assertParticipant(record, actorId);
  requireCondition(record.homeowner.toString() === actorId.toString(), "Only the homeowner can pay for this request", 403);

  const purpose = PURPOSE_BY_STATUS[effectiveStatus(record, now)];
  requireCondition(purpose, "This request is not waiting for a payment", 409, "PAYMENT_NOT_DUE");
  const due = expectedPayment(record, purpose);
  requireCondition(due && Number.isSafeInteger(due.amount) && due.amount >= 1, "There is nothing to pay at this stage", 409, "PAYMENT_NOT_DUE");
  const paymentDeadline = deadlineFor(record, purpose);
  requireCondition(!paymentDeadline || paymentDeadline.getTime() - now.getTime() >= MIN_TIME_LEFT_MS,
    "There is not enough time left to pay before this booking expires", 409, "PAYMENT_WINDOW_CLOSING");

  // Do not take money for a booking that could not be applied.
  await assertEligibleParticipants(record.homeowner, record.artisan);

  const client = paymentProvider.client();
  // Never charge twice: an earlier checkout may have been paid with its confirmation lost (tab closed, signal
  // dropped). Ask Paystack about recent unsettled ones first and settle any that were paid.
  const earlier = await PaymentAttempt.find({ requestId: record._id, purpose }).sort({ createdAt: -1 }).limit(RECHECK_LIMIT);
  for (const attempt of earlier) {
    if (await settled(attempt)) continue;
    const outcome = await settleAttempt(attempt, record, await client.verify(attempt._id));
    // A paid attempt that could not count (recorded for support and refund) must not block paying correctly.
    requireCondition(outcome !== "applied", "This payment was already made. Reload the request to see it.", 409, "PAYMENT_ALREADY_MADE");
  }

  const open = earlier.find((attempt) => attempt.amount === due.amount && attempt.currency === due.currency
    && attempt.createdAt > new Date(now.getTime() - REUSE_MS));
  if (open) return attemptView(open, paymentDeadline);

  const homeowner = await User.findById(record.homeowner).select("email").read("primary");
  requireCondition(homeowner?.email, "An active homeowner account is required", 403);
  const reference = paymentReference(record._id.toString(), purpose);
  const { accessCode } = await client.initialize({
    email: homeowner.email, amount: due.amount, currency: due.currency, reference,
    metadata: { requestId: record._id.toString(), purpose },
  });
  const attempt = await PaymentAttempt.create({
    _id: reference, provider: "paystack", requestId: record._id, homeowner: record.homeowner,
    purpose, amount: due.amount, currency: due.currency, accessCode,
  });
  return attemptView(attempt, paymentDeadline);
};

// --- Confirm after the popup ------------------------------------------------------------------------------------

// The popup is not trusted: Paystack's own record decides, and the request and purpose always come from our
// stored attempt, never from the browser or provider metadata. Safe to call repeatedly.
export const confirmPayment = async (id, actorId, reference) => {
  requireCondition(isOurReference(reference), "Invalid payment reference", 400, "INVALID_PAYMENT_REFERENCE");
  const record = await loadRequest(id);
  assertParticipant(record, actorId);
  requireCondition(record.homeowner.toString() === actorId.toString(), "Only the homeowner can confirm this payment", 403);
  const attempt = await PaymentAttempt.findById(reference);
  requireCondition(attempt && attempt.requestId.equals(record._id) && attempt.homeowner.equals(record.homeowner),
    "Payment not found", 404, "PAYMENT_NOT_FOUND");

  const transaction = await paymentProvider.client().verify(reference);
  const outcome = await settleAttempt(attempt, record, transaction);
  const [request] = await withParticipants([requestView(await loadRequest(id))]);
  // status is Paystack's (success, ongoing, pending, abandoned, failed, reversed); outcome is ours once settled.
  return { reference: attempt._id, purpose: attempt.purpose, status: transaction.status, outcome, request };
};
