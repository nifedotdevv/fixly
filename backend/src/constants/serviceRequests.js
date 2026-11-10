export const REQUEST_STATUS = Object.freeze({
  PENDING: "pending", REJECTED: "rejected", RESPONSE_EXPIRED: "response_expired",
  CANCELLED: "cancelled", AWAITING_INSPECTION_PAYMENT: "awaiting_inspection_payment",
  INSPECTION_PAYMENT_EXPIRED: "inspection_payment_expired", INSPECTION_CONFIRMED: "inspection_confirmed",
  INSPECTION_COMPLETED: "inspection_completed", QUOTE_SUBMITTED: "quote_submitted",
  QUOTE_EXPIRED: "quote_expired", REPAIR_NOT_PROCEEDING: "repair_not_proceeding",
  AWAITING_REPAIR_DEPOSIT: "awaiting_repair_deposit", REPAIR_PAYMENT_EXPIRED: "repair_payment_expired",
  REPAIR_CONFIRMED: "repair_confirmed", REPAIR_IN_PROGRESS: "repair_in_progress",
  AWAITING_HOMEOWNER_CONFIRMATION: "awaiting_homeowner_confirmation", PROBLEM_REPORTED: "problem_reported",
  AWAITING_FINAL_PAYMENT: "awaiting_final_payment", COMPLETED: "completed",
});
export const RESOLVED_STATUSES = [
  REQUEST_STATUS.REJECTED, REQUEST_STATUS.RESPONSE_EXPIRED, REQUEST_STATUS.CANCELLED,
  REQUEST_STATUS.INSPECTION_PAYMENT_EXPIRED, REQUEST_STATUS.QUOTE_EXPIRED,
  REQUEST_STATUS.REPAIR_NOT_PROCEEDING, REQUEST_STATUS.REPAIR_PAYMENT_EXPIRED, REQUEST_STATUS.COMPLETED,
];
export const PAYMENT_PURPOSES = ["inspection", "repair_deposit", "repair_balance"];
