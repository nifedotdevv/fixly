import PaymentEvent from "../../models/paymentEvent.js";
import { REQUEST_STATUS as S } from "../../constants/serviceRequests.js";
import { isDuplicateKey } from "../../utils/errors.js";
import { paymentEventSchema } from "../../validation/serviceRequests.js";
import { runAccountLifecycles } from "../accountLifecycle.js";
import { assertEligibleParticipants, loadRequest } from "./serviceRequests.js";
import { effectiveStatus, requireCondition } from "./rules.js";

const outcomeView = (event) => ({
  externalReference: event._id, requestId: event.requestId, purpose: event.purpose,
  outcome: event.outcome, ...(event.reason ? { reason: event.reason } : {}),
});
const sameEvent = (record, input) => record.requestId.toString() === input.requestId
  && record.purpose === input.purpose && record.amount === input.amount && record.currency === input.currency;
const expectedPayment = (record, purpose) => {
  if (purpose === "inspection") return record.inspectionFee;
  if (!record.quote) return undefined;
  return { amount: purpose === "repair_deposit" ? record.quote.depositAmount : record.quote.balanceAmount,
    currency: record.quote.total.currency };
};
const eligibleStage = { inspection: S.AWAITING_INSPECTION_PAYMENT, repair_deposit: S.AWAITING_REPAIR_DEPOSIT, repair_balance: S.AWAITING_FINAL_PAYMENT };
const reservationEnded = (reservation, now) => reservation
  && (reservation.paymentDeadline <= now || ["released", "expired"].includes(reservation.state));
const reconcile = async (receipt) => {
  receipt.outcome = "reconciliation_required";
  receipt.reason = "The reservation or eligible stage ended before this payment could be applied. No slot was reclaimed; support reconciliation is required.";
  await receipt.save();
  return outcomeView(receipt);
};

// TRUSTED INTERNAL BOUNDARY ONLY. The future caller must verify provider authenticity and successful
// payment outside this function. This module is intentionally not mounted on any HTTP route.
export const applyVerifiedPayment = async (event) => {
  const { error, value: input } = paymentEventSchema.validate(event, { abortEarly: false, convert: false });
  requireCondition(!error, error?.message || "Invalid verified payment event", 400);
  input.requestId = input.requestId.toLowerCase();
  const initial = await loadRequest(input.requestId);
  return runAccountLifecycles([initial.homeowner, initial.artisan], "verified-payment", async () => {
    const record = await loadRequest(input.requestId);
    let receipt = await PaymentEvent.findById(input.externalReference);
    if (receipt) {
      requireCondition(sameEvent(receipt, input), "External payment reference was already used for a different event");
      if (receipt.outcome !== "processing") return outcomeView(receipt);
    }
    // A crash can occur after the atomic request write but before receipt finalisation.
    // The embedded reference makes that replay safe even after subsequent stage changes.
    const applied = record.verifiedPayments.find((payment) => payment.externalReference === input.externalReference);
    if (applied) {
      requireCondition(applied.purpose === input.purpose && applied.amount === input.amount && applied.currency === input.currency,
        "External payment reference does not match the recorded payment");
      requireCondition(receipt, "Payment receipt is missing; operator reconciliation is required");
      receipt.outcome = "applied"; await receipt.save();
      return outcomeView(receipt);
    }
    const expected = expectedPayment(record, input.purpose);
    requireCondition(expected && expected.amount === input.amount && expected.currency === input.currency,
      "Payment purpose, amount, or currency does not match the expected obligation", 422);
    let now = new Date();
    let status = effectiveStatus(record, now);
    const appointmentKind = input.purpose === "inspection" ? "inspection" : "repair";
    const reservation = record[appointmentKind];
    let expired = input.purpose !== "repair_balance" && reservationEnded(reservation, now);
    // A previously started processing attempt can also require reconciliation after a stage change.
    requireCondition(expired || status === eligibleStage[input.purpose] || receipt,
      "Payment is not eligible at the current booking stage");
    if (!receipt) {
      try {
        receipt = await PaymentEvent.create({
          _id: input.externalReference, requestId: record._id, homeowner: record.homeowner, artisan: record.artisan,
          purpose: input.purpose, amount: input.amount, currency: input.currency,
        });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        receipt = await PaymentEvent.findById(input.externalReference);
        requireCondition(receipt && sameEvent(receipt, input), "External payment reference was already used for a different event");
        if (receipt.outcome !== "processing") return outcomeView(receipt);
      }
    }
    if (expired || status !== eligibleStage[input.purpose]) return reconcile(receipt);
    try { await assertEligibleParticipants(record.homeowner, record.artisan); }
    catch (error) {
      if (error.statusCode) return reconcile(receipt);
      throw error;
    }
    now = new Date();
    status = effectiveStatus(record, now);
    expired = input.purpose !== "repair_balance" && reservationEnded(reservation, now);
    if (expired || status !== eligibleStage[input.purpose]) return reconcile(receipt);
    record.$where = { status: eligibleStage[input.purpose] };
    if (input.purpose === "repair_balance") {
      record.status = S.COMPLETED; record.completedAt = now;
    } else {
      requireCondition(reservation.state === "reserved", "Payment requires a live temporary reservation");
      record.$where[`${appointmentKind}.state`] = "reserved";
      record.$where.$expr = { $gt: [`$${appointmentKind}.paymentDeadline`, "$$NOW"] };
      reservation.state = "confirmed"; reservation.confirmedAt = now;
      record.status = input.purpose === "inspection" ? S.INSPECTION_CONFIRMED : S.REPAIR_CONFIRMED;
    }
    record.verifiedPayments.push({
      purpose: input.purpose, amount: input.amount, currency: input.currency,
      externalReference: input.externalReference, recordedAt: now,
    });
    // Stage, appointment confirmation and verified reference commit in one document write.
    try { await record.save(); }
    catch (error) {
      if (["VersionError", "DocumentNotFoundError"].includes(error.name)) return reconcile(receipt);
      throw error;
    }
    receipt.outcome = "applied";
    await receipt.save();
    return outcomeView(receipt);
  });
};
