import express from "express";
import { requireAuth } from "../middleware/authentication.js";
import { validateRequestBody as validate } from "../validation/serviceRequests.js";
import { createRequestController, requestAction, getServiceRequest, listServiceRequests } from "../controllers/serviceRequests.js";
import {
  createServiceRequest, addClarification, acceptServiceRequest, rejectServiceRequest, cancelServiceRequest,
  completeInspection, submitQuote, approveQuote, declineQuote, startRepair,
  reportRepairCompletion, confirmRepairCompletion, reportProblem,
} from "../services/requests/serviceRequests.js";

const router = express.Router();
router.use(requireAuth);
router.post("/", validate("create"), createRequestController(createServiceRequest));
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
export default router;
