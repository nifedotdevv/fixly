import ServiceRequest from "../models/serviceRequest.js";
import { handleMongooseError } from "../utils/errors.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import { requestView } from "../services/requests/rules.js";
import { assertParticipant, loadRequest } from "../services/requests/serviceRequests.js";

const respond = (res, statusCode, data, message = "Service request updated successfully") =>
  res.status(statusCode).json({ statusCode, success: true, message, data });
const failure = (res, error) => error.statusCode
  ? res.status(error.statusCode).json({ statusCode: error.statusCode, success: false, message: error.message })
  : handleMongooseError(res, error);
export const requestAction = (operation, statusCode = 200) => async (req, res) => {
  try {
    return respond(res, statusCode, await operation(req.params.id, req.user._id, req.body));
  } catch (error) { return failure(res, error); }
};
export const createRequestController = (operation) => async (req, res) => {
  try { return respond(res, 201, await operation(req.user._id, req.body), "Service request created successfully"); }
  catch (error) { return failure(res, error); }
};
export const getServiceRequest = async (req, res) => {
  try {
    const record = await loadRequest(req.params.id);
    assertParticipant(record, req.user._id);
    return respond(res, 200, requestView(record), "Service request retrieved successfully");
  } catch (error) { return failure(res, error); }
};
export const listServiceRequests = async (req, res) => {
  try {
    const { limit, page, skip } = parsePagination(req.query);
    // Explicit participant filter; no admin bypass and no populated account documents.
    const filter = { $or: [{ homeowner: req.user._id }, { artisan: req.user._id }] };
    const [records, total] = await Promise.all([
      ServiceRequest.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
      ServiceRequest.countDocuments(filter),
    ]);
    return res.status(200).json({ statusCode: 200, success: true, message: "Your service requests retrieved successfully",
      data: records.map((record) => requestView(record)), meta: paginationMeta(total, page, limit) });
  } catch (error) { return failure(res, error); }
};
