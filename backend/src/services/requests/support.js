import User from "../../models/users.js";
import PaymentEvent from "../../models/paymentEvent.js";
import { REQUEST_STATUS as S } from "../../constants/serviceRequests.js";
import { runAccountLifecycles } from "../accountLifecycle.js";
import { loadRequest } from "./serviceRequests.js";
import { requireCondition } from "./rules.js";

const assertAdmin = async (authenticatedActor) => {
  const actor = await User.findById(authenticatedActor._id).select("+authVersion");
  requireCondition(actor && !actor.isDeleted && actor.role === "admin"
    && (actor.authVersion || 0) === (authenticatedActor.authVersion || 0),
  "An active administrator account and session are required", 403);
};
const sameResolution = (resolution, input) => resolution.disposition === input.disposition
  && resolution.note === input.note && (resolution.resolutionReference || "") === (input.resolutionReference || "");

export const resolveProblem = async (id, actor, input) => {
  const actorId = actor._id;
  const initial = await loadRequest(id);
  return runAccountLifecycles([initial.homeowner, initial.artisan, actorId], "support-resolution", async () => {
    await assertAdmin(actor);
    const record = await loadRequest(id);
    const previous = record.supportResolutions.at(-1);
    const reportedAt = new Date(input.problemReportedAt).getTime();
    requireCondition(Number.isFinite(reportedAt) && record.problem?.reportedAt?.getTime() === reportedAt,
      "The reported problem changed. Reload it before resolving.");
    if (record.status !== S.PROBLEM_REPORTED) {
      requireCondition(previous && previous.problemReportedAt.getTime() === reportedAt && sameResolution(previous, input),
        "This problem has already been resolved or is not awaiting support");
      return record;
    }
    requireCondition(record.supportResolutions.length < 100, "This request has reached the support resolution limit");
    const now = new Date();
    record.supportResolutions.push({ ...input, resolvedBy: actorId, resolvedAt: now,
      problemReportedAt: record.problem.reportedAt, problemExplanation: record.problem.explanation });
    if (input.disposition === "close") {
      // Administrative closure records an external settlement decision. It never records a payment or refund.
      record.status = S.SUPPORT_CLOSED;
      record.supportClosedAt = now;
      for (const kind of ["inspection", "repair"]) {
        if (record[kind] && ["reserved", "confirmed"].includes(record[kind].state)) record[kind].state = "released";
      }
    } else {
      // Preserve homeowner confirmation and the verified final-balance boundary.
      record.status = S.AWAITING_HOMEOWNER_CONFIRMATION;
    }
    await record.save();
    return record;
  });
};

export const resolveReconciliation = async (actor, input) => {
  const actorId = actor._id;
  const initial = await PaymentEvent.findById(input.paymentReference);
  requireCondition(initial, "Payment event not found", 404);
  return runAccountLifecycles([initial.homeowner, initial.artisan, actorId], "support-resolution", async () => {
    await assertAdmin(actor);
    const event = await PaymentEvent.findById(input.paymentReference);
    requireCondition(event, "Payment event not found", 404);
    requireCondition(event.outcome === "reconciliation_required", "Only reconciliation-required events can be resolved");
    if (event.resolution) {
      requireCondition(sameResolution(event.resolution, input), "This payment event has already been resolved differently");
      return event;
    }
    event.resolution = { disposition: input.disposition, note: input.note,
      resolutionReference: input.resolutionReference, resolvedBy: actorId, resolvedAt: new Date() };
    await event.save();
    return event;
  });
};
