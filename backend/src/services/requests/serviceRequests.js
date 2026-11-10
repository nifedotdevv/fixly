import mongoose from "mongoose";
import User from "../../models/users.js";
import Profile from "../../models/artisanProfile.js";
import ServiceRequest from "../../models/serviceRequest.js";
import { REQUEST_STATUS as S } from "../../constants/serviceRequests.js";
import { runAccountLifecycles } from "../accountLifecycle.js";
import { assertStage, effectiveStatus, expiryRules, requireCondition, requestConfig, requestView, splitQuote, validateWindow } from "./rules.js";
import { reserve } from "./reservations.js";

const dates = ({ start, end }) => ({ start: new Date(start), end: new Date(end) });
export const loadRequest = async (id) => {
  requireCondition(typeof id === "string" && /^[a-f\d]{24}$/i.test(id), "Invalid service request id", 400);
  const record = await ServiceRequest.findById(id);
  requireCondition(record, "Service request not found", 404);
  return record;
};
export const assertParticipant = (record, actorId) => {
  requireCondition([record.homeowner, record.artisan].some((id) => id.toString() === actorId.toString()), "Service request not found", 404);
};
export const assertEligibleParticipants = async (homeownerId, artisanId) => {
  const [homeowner, artisan, profile] = await Promise.all([
    User.findById(homeownerId).read("primary"), User.findById(artisanId).read("primary"),
    Profile.exists({ user_id: artisanId, isDeleted: { $ne: true } }).read("primary"),
  ]);
  requireCondition(homeowner && !homeowner.isDeleted && homeowner.role === "house_owner", "An active homeowner account is required", 403);
  requireCondition(artisan && !artisan.isDeleted && artisan.role === "artisan" && profile, "The selected artisan is not eligible", 400);
};
export const createServiceRequest = async (homeownerId, input) => {
  requireCondition(mongoose.Types.ObjectId.isValid(input.artisan), "Invalid artisan id", 400);
  requireCondition(homeownerId.toString() !== input.artisan, "Self-booking is not permitted", 400);
  return runAccountLifecycles([homeownerId, input.artisan], "service-request", async () => {
    await assertEligibleParticipants(homeownerId, input.artisan);
    const now = new Date();
    const window = dates(input.inspectionWindow);
    validateWindow(window, now);
    const deadline = new Date(input.responseDeadline);
    const config = requestConfig();
    const distance = deadline - now;
    requireCondition(distance >= config.responseMinMs && distance <= config.responseMaxMs && deadline <= window.start,
      "Response deadline must be within the configured bounds and no later than inspection start", 400);
    const record = await ServiceRequest.create({
      homeowner: homeownerId, artisan: input.artisan, description: input.description,
      serviceAddress: input.serviceAddress, inspectionWindow: window, responseDeadline: deadline,
    });
    return requestView(record);
  });
};

// Participant references are immutable. Re-read the request and both accounts after acquiring locks.
const changeRequest = async (id, actorId, participant, operation) => {
  const initial = await loadRequest(id);
  assertParticipant(initial, actorId);
  requireCondition(initial[participant].toString() === actorId.toString(), "Only the assigned participant may perform this action", 403);
  return runAccountLifecycles([initial.homeowner, initial.artisan], "service-request", async () => {
    const record = await loadRequest(id);
    await assertEligibleParticipants(record.homeowner, record.artisan);
    const now = new Date();
    const expiry = expiryRules.find((rule) => rule.from === record.status);
    // Also enforce an existing deadline at the database write, not just before asynchronous work.
    record.$where = { status: record.status, ...(expiry ? {
      $expr: { $gt: [`$${expiry.field}`, "$$NOW"] },
    } : {}) };
    await operation(record, now);
    await record.save();
    return requestView(record);
  });
};
export const addClarification = (id, actorId, input) => changeRequest(id, actorId, "homeowner", (record, now) => {
  assertStage(record, [S.PENDING], now);
  requireCondition(record.notes.length < 100, "This request already has the maximum 100 clarification notes");
  record.notes.push({ text: input.text, createdAt: now });
});
export const acceptServiceRequest = (id, actorId, input) => changeRequest(id, actorId, "artisan", async (record, now) => {
  assertStage(record, [S.PENDING], now);
  validateWindow(record.inspectionWindow, now);
  await reserve(record, "inspection", record.inspectionWindow, requestConfig().inspectionPaymentMs, now);
  record.inspectionFee = { amount: input.inspectionFee.amount, currency: input.inspectionFee.currency };
  record.acceptedAt = now;
  record.status = S.AWAITING_INSPECTION_PAYMENT;
});
export const rejectServiceRequest = (id, actorId, input) => changeRequest(id, actorId, "artisan", (record, now) => {
  assertStage(record, [S.PENDING], now);
  record.status = S.REJECTED; record.rejectedAt = now; record.rejectionReason = input.reason;
});
export const cancelServiceRequest = (id, actorId) => changeRequest(id, actorId, "homeowner", (record, now) => {
  requireCondition([S.PENDING, S.AWAITING_INSPECTION_PAYMENT, S.AWAITING_REPAIR_DEPOSIT].includes(effectiveStatus(record, now)),
    "Only pending requests and unpaid reservations can be cancelled. Confirmed appointments, work, or reported problems require support; cancellation does not settle payments.");
  if (record.status === S.AWAITING_REPAIR_DEPOSIT) {
    // End only the unpaid repair proposal; preserve the completed inspection and its payment record.
    record.repair.state = "released";
    record.status = S.REPAIR_NOT_PROCEEDING;
  } else {
    if (record.inspection) record.inspection.state = "released";
    record.status = S.CANCELLED;
  }
  record.cancelledAt = now;
});
export const completeInspection = (id, actorId) => changeRequest(id, actorId, "artisan", (record, now) => {
  assertStage(record, [S.INSPECTION_CONFIRMED], now);
  requireCondition(now >= record.inspection.window.end, "The confirmed inspection window has not ended");
  record.inspection.state = "completed"; record.inspection.completedAt = now;
  record.status = S.INSPECTION_COMPLETED;
});
export const submitQuote = (id, actorId, input) => changeRequest(id, actorId, "artisan", (record, now) => {
  assertStage(record, [S.INSPECTION_COMPLETED], now);
  requireCondition(!record.quote, "A submitted quote cannot be replaced");
  const window = dates(input.repairWindow);
  validateWindow(window, now);
  const expiresAt = new Date(input.expiresAt);
  requireCondition(expiresAt > now && expiresAt <= window.start, "Quote expiry must be in the future and no later than repair start", 400);
  record.quote = {
    scope: input.scope, total: { amount: input.total.amount, currency: input.total.currency },
    ...splitQuote(input.total.amount), window, expiresAt, submittedAt: now,
  };
  record.status = S.QUOTE_SUBMITTED;
});
export const approveQuote = (id, actorId) => changeRequest(id, actorId, "homeowner", async (record, now) => {
  assertStage(record, [S.QUOTE_SUBMITTED], now);
  validateWindow(record.quote.window, now);
  await reserve(record, "repair", record.quote.window, requestConfig().repairPaymentMs, now, record.quote.expiresAt);
  record.quote.approvedAt = now;
  record.status = S.AWAITING_REPAIR_DEPOSIT;
});
export const declineQuote = (id, actorId) => changeRequest(id, actorId, "homeowner", (record, now) => {
  assertStage(record, [S.QUOTE_SUBMITTED], now);
  record.quote.declinedAt = now; record.status = S.REPAIR_NOT_PROCEEDING;
});
export const startRepair = (id, actorId) => changeRequest(id, actorId, "artisan", (record, now) => {
  assertStage(record, [S.REPAIR_CONFIRMED], now);
  requireCondition(now >= record.repair.window.start, "The confirmed repair window has not started");
  record.workStartedAt = now; record.status = S.REPAIR_IN_PROGRESS;
});
export const reportRepairCompletion = (id, actorId) => changeRequest(id, actorId, "artisan", (record, now) => {
  assertStage(record, [S.REPAIR_IN_PROGRESS], now);
  record.artisanCompletedAt = now; record.status = S.AWAITING_HOMEOWNER_CONFIRMATION;
});
export const confirmRepairCompletion = (id, actorId) => changeRequest(id, actorId, "homeowner", (record, now) => {
  assertStage(record, [S.AWAITING_HOMEOWNER_CONFIRMATION], now);
  record.homeownerConfirmedAt = now; record.repair.completedAt = now; record.repair.state = "completed";
  record.status = S.AWAITING_FINAL_PAYMENT;
});
export const reportProblem = (id, actorId, input) => changeRequest(id, actorId, "homeowner", (record, now) => {
  assertStage(record, [S.AWAITING_HOMEOWNER_CONFIRMATION], now);
  record.problem = { explanation: input.explanation, reportedAt: now };
  record.status = S.PROBLEM_REPORTED;
});
