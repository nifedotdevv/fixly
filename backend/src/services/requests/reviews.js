import ServiceRequest from "../../models/serviceRequest.js";
import User from "../../models/users.js";
import { runAccountLifecycles } from "../accountLifecycle.js";
import { withParticipants } from "./participants.js";
import { loadRequest, assertParticipant } from "./serviceRequests.js";
import { requireCondition, requestView } from "./rules.js";
import { REQUEST_STATUS as S } from "../../constants/serviceRequests.js";

// A review and its booking commit together. Aggregates are computed from these
// records rather than maintaining a second, potentially divergent counter.
export const submitReview = async (id, actor, input) => {
  const initial = await loadRequest(id);
  assertParticipant(initial, actor._id);
  requireCondition(initial.homeowner.equals(actor._id), "Only the booking homeowner may review this job", 403);
  return runAccountLifecycles([initial.homeowner, initial.artisan], "review", async () => {
    const homeowner = await User.findById(actor._id).select("+authVersion");
    requireCondition(homeowner && !homeowner.isDeleted && homeowner.role === "house_owner"
      && (homeowner.authVersion || 0) === (actor.authVersion || 0), "Account session is no longer eligible", 401);
    const record = await loadRequest(id);
    requireCondition(record.status === S.COMPLETED, "Only completed bookings can be reviewed");
    requireCondition(!record.review, "This booking has already been reviewed");
    record.review = { rating: input.rating, comment: input.comment, createdAt: new Date() };
    await record.save();
    return (await withParticipants([requestView(record)]))[0];
  });
};

export const ratingSummaries = async (artisanIds) => {
  if (!artisanIds.length) return new Map();
  const rows = await ServiceRequest.aggregate([
    { $match: { artisan: { $in: artisanIds }, status: S.COMPLETED, "review.rating": { $exists: true } } },
    { $group: { _id: "$artisan", count: { $sum: 1 }, average: { $avg: "$review.rating" } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), { count: row.count, average: row.average }]));
};
export const emptyRatingSummary = () => ({ count: 0, average: null });
