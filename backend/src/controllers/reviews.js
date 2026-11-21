import { submitReview } from "../services/requests/reviews.js";
import { handleMongooseError } from "../utils/errors.js";

export const createReview = async (req, res) => {
  try {
    const data = await submitReview(req.params.id, req.user, req.body);
    return res.status(201).json({ statusCode: 201, success: true, message: "Review submitted successfully", data });
  } catch (error) { return handleMongooseError(res, error); }
};
