import { REQUEST_STATUS as S, RESOLVED_STATUSES } from "../../constants/serviceRequests.js";
import ServiceRequest from "../../models/serviceRequest.js";
import PaymentEvent from "../../models/paymentEvent.js";

export class RequestError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
export const requireCondition = (condition, message, statusCode = 409) => {
  if (!condition) throw new RequestError(statusCode, message);
};
const positiveConfig = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || !Number.isSafeInteger(value * 60000)) {
    throw new Error(`${name} must be a positive integer representable in milliseconds`);
  }
  return value;
};
export const requestConfig = () => {
  const min = positiveConfig("REQUEST_RESPONSE_MIN_MINUTES", 15);
  const max = positiveConfig("REQUEST_RESPONSE_MAX_MINUTES", 10080);
  if (min > max) throw new Error("Request response minimum cannot exceed maximum");
  return {
    responseMinMs: min * 60000, responseMaxMs: max * 60000,
    inspectionPaymentMs: positiveConfig("INSPECTION_PAYMENT_MINUTES", 30) * 60000,
    repairPaymentMs: positiveConfig("REPAIR_DEPOSIT_MINUTES", 1440) * 60000,
  };
};
export const validateWindow = (window, now) => {
  requireCondition(window.start > now && window.end > window.start, "Appointment must have a future start and an end after its start", 400);
};
export const splitQuote = (total) => {
  // BigInt avoids multiplication rounding near Number.MAX_SAFE_INTEGER.
  const deposit = Number((BigInt(total) * 70n + 99n) / 100n);
  return { depositAmount: deposit, balanceAmount: total - deposit };
};
export const expiryRules = [
  { from: S.PENDING, field: "responseDeadline", to: S.RESPONSE_EXPIRED },
  { from: S.AWAITING_INSPECTION_PAYMENT, field: "inspection.paymentDeadline", to: S.INSPECTION_PAYMENT_EXPIRED, appointment: "inspection" },
  { from: S.QUOTE_SUBMITTED, field: "quote.expiresAt", to: S.QUOTE_EXPIRED },
  { from: S.AWAITING_REPAIR_DEPOSIT, field: "repair.paymentDeadline", to: S.REPAIR_PAYMENT_EXPIRED, appointment: "repair" },
];
const atPath = (record, path) => path.split(".").reduce((value, key) => value?.[key], record);
export const effectiveStatus = (record, now = new Date()) =>
  expiryRules.find((rule) => record.status === rule.from && atPath(record, rule.field) <= now)?.to || record.status;
export const unresolvedFilter = (id, now = new Date()) => ({
  $or: [{ homeowner: id }, { artisan: id }],
  status: { $nin: RESOLVED_STATUSES },
  $nor: expiryRules.map((rule) => ({ status: rule.from, [rule.field]: { $lte: now } })),
});
// Optional maintenance; correctness of reads, transitions, scheduling, and lifecycle guards never depends on running it.
export const expireServiceRequests = async (filter = {}, now = new Date()) => {
  for (const rule of expiryRules) {
    await ServiceRequest.updateMany({ $and: [filter, { status: rule.from, [rule.field]: { $lte: now } }] }, {
      $set: { status: rule.to, expiredAt: now, ...(rule.appointment ? { [`${rule.appointment}.state`]: "expired" } : {}) },
      $inc: { __v: 1 },
    });
  }
};
export const assertNoBookingObligations = async (id) => {
  const [booking, payment] = await Promise.all([
    ServiceRequest.exists(unresolvedFilter(id)),
    PaymentEvent.exists({ $or: [{ homeowner: id }, { artisan: id }], outcome: { $in: ["processing", "reconciliation_required"] } }),
  ]);
  requireCondition(!booking && !payment,
    "Account has unresolved service requests or booking obligations. Resolve them before deletion or changing participation roles.");
};
export const assertStage = (record, allowed, now = new Date()) => {
  requireCondition(allowed.includes(effectiveStatus(record, now)), "This action is not permitted at the current request stage");
};
export const requestView = (record, now = new Date()) => {
  const status = effectiveStatus(record, now);
  const effectiveExpiry = expiryRules.find((rule) => rule.from === record.status && rule.to === status);
  const appointmentView = (appointment, kind) => appointment ? {
    window: appointment.window, state: status === (kind === "inspection" ? S.INSPECTION_PAYMENT_EXPIRED : S.REPAIR_PAYMENT_EXPIRED) ? "expired" : appointment.state,
    paymentDeadline: appointment.paymentDeadline, confirmedAt: appointment.confirmedAt, completedAt: appointment.completedAt,
  } : undefined;
  return {
    id: record._id, homeowner: record.homeowner, artisan: record.artisan,
    description: record.description, serviceAddress: record.serviceAddress,
    inspectionWindow: record.inspectionWindow, responseDeadline: record.responseDeadline,
    status, notes: record.notes.map(({ text, createdAt }) => ({ text, createdAt })),
    inspectionFee: record.inspectionFee, inspection: appointmentView(record.inspection, "inspection"),
    repair: appointmentView(record.repair, "repair"), quote: record.quote,
    acceptedAt: record.acceptedAt, rejectedAt: record.rejectedAt, rejectionReason: record.rejectionReason,
    cancelledAt: record.cancelledAt, expiredAt: effectiveExpiry ? atPath(record, effectiveExpiry.field) : record.expiredAt,
    workStartedAt: record.workStartedAt, artisanCompletedAt: record.artisanCompletedAt,
    homeownerConfirmedAt: record.homeownerConfirmedAt, problem: record.problem,
    completedAt: record.completedAt, createdAt: record.createdAt, updatedAt: record.updatedAt,
    payments: record.verifiedPayments.map(({ purpose, amount, currency, recordedAt }) => ({ purpose, amount, currency, recordedAt })),
  };
};
