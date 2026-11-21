import Joi from "joi";
import ServiceRequest from "../../models/serviceRequest.js";
import PaymentEvent from "../../models/paymentEvent.js";
import { loadRequest } from "../../services/requests/serviceRequests.js";
import { resolveProblem, resolveReconciliation } from "../../services/requests/support.js";
import { handleMongooseError } from "../../utils/errors.js";
import { parsePagination, paginationMeta } from "../../utils/pagination.js";

const fields = {
  note: Joi.string().trim().min(1).max(2000).required(),
  resolutionReference: Joi.string().trim().min(1).max(200),
};
const problemSchema = Joi.object({
  ...fields,
  problemReportedAt: Joi.string().isoDate().required(),
  disposition: Joi.string().valid("resume_confirmation", "close").required(),
  resolutionReference: fields.resolutionReference.when("disposition", { is: "close", then: Joi.required() }),
});
const paymentSchema = Joi.object({
  ...fields,
  disposition: Joi.string().valid("externally_refunded", "externally_settled").required(),
  resolutionReference: fields.resolutionReference.required(),
  paymentReference: Joi.string().trim().min(1).max(200).required(),
});
const send = (res, data, message = "Support record retrieved successfully") =>
  res.status(200).json({ statusCode: 200, success: true, message, data });
const resolve = (schema, operation) => async (req, res) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) return res.status(400).json({ statusCode: 400, success: false, message: error.message });
  try { return send(res, await operation(req, value), "Support resolution recorded successfully"); }
  catch (error) { return handleMongooseError(res, error); }
};
export const resolveSupportProblem = resolve(problemSchema, (req, value) => resolveProblem(req.params.id, req.user, value));
export const resolveSupportPayment = resolve(paymentSchema, (req, value) => resolveReconciliation(req.user, value));
export const getSupportRequest = async (req, res) => {
  try { return send(res, await loadRequest(req.params.id)); }
  catch (error) { return handleMongooseError(res, error); }
};
const list = (Model, filter) => async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [data, total] = await Promise.all([
      Model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit), Model.countDocuments(filter),
    ]);
    return res.status(200).json({ statusCode: 200, success: true, message: "Support records retrieved successfully",
      data, meta: paginationMeta(total, page, limit) });
  } catch (error) { return handleMongooseError(res, error); }
};
export const listSupportProblems = list(ServiceRequest, { status: "problem_reported" });
export const listSupportPayments = list(PaymentEvent, { outcome: "reconciliation_required", resolution: { $exists: false } });
