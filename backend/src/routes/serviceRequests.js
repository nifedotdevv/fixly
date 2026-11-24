import express from "express";
import rateLimit from "express-rate-limit";
import { createReview } from "../controllers/reviews.js";
import { confirmPayment, startPayment } from "../services/payments/checkout.js";
import { requireAuth } from "../middleware/authentication.js";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail.js";
import { validateRequestBody as validate } from "../validation/serviceRequests.js";
import { createRequestController, failure, requestAction, respond, getServiceRequest, listServiceRequests } from "../controllers/serviceRequests.js";
import {
  createServiceRequest, addClarification, acceptServiceRequest, rejectServiceRequest, cancelServiceRequest,
  completeInspection, submitQuote, approveQuote, declineQuote, startRepair,
  reportRepairCompletion, confirmRepairCompletion, reportProblem,
} from "../services/requests/serviceRequests.js";

const router = express.Router();
router.use(requireAuth);
// Every payment call reaches Paystack, so each signed-in user gets a small budget on top of the per-IP limit.
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => Number(process.env.PAYMENT_RATE_LIMIT_MAX) || 20,
  keyGenerator: (req) => `user:${req.user._id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, success: false, message: "Too many payment attempts. Wait a minute and try again." },
});
router.post("/", requireVerifiedEmail, validate("create"), createRequestController(createServiceRequest));
router.get("/", listServiceRequests);
router.get("/:id", getServiceRequest);
router.post("/:id/notes", validate("note"), requestAction(addClarification));
router.post("/:id/accept", validate("accept"), requestAction(acceptServiceRequest));
router.post("/:id/reject", validate("reject"), requestAction(rejectServiceRequest));
router.post("/:id/cancel", validate("empty"), requestAction(cancelServiceRequest));
router.post("/:id/inspection/complete", validate("empty"), requestAction(completeInspection));
router.post("/:id/quote", validate("quote"), requestAction(submitQuote));
router.post("/:id/quote/approve", validate("empty"), requestAction(approveQuote));
router.post("/:id/quote/decline", validate("empty"), requestAction(declineQuote));
router.post("/:id/repair/start", validate("empty"), requestAction(startRepair));
router.post("/:id/repair/complete", validate("empty"), requestAction(reportRepairCompletion));
router.post("/:id/completion/confirm", validate("empty"), requestAction(confirmRepairCompletion));
router.post("/:id/problems", validate("problem"), requestAction(reportProblem));
router.post("/:id/review", validate("review"), createReview);
router.post("/:id/payments", paymentLimiter, requireVerifiedEmail, validate("empty"), requestAction(startPayment, 201));
router.post("/:id/payments/:reference/verify", paymentLimiter, validate("empty"), async (req, res) => {
  try { return respond(res, 200, await confirmPayment(req.params.id, req.user._id, req.params.reference), "Payment checked"); }
  catch (error) { return failure(res, error); }
});
export default router;
