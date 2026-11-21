import mongoose from "mongoose";
import Profile from "../../models/artisanProfile.js";
import { handleMongooseError } from "../../utils/errors.js";

const IMMUTABLE_FIELDS = ["user_id", "rating", "_id", "__v"];
const UPDATABLE_FIELDS = [
  "professional_headline",
  "profession",
  "experience_years",
  "phone_number",
  "starting_price",
  "residential_address",
  "office_address",
  "skills",
  "city",
  "serviceAreas",
  "isAvailable",
];

const assertValidId = (id) => id && mongoose.Types.ObjectId.isValid(id);

const rejectImmutable = (body) => {
  const found = IMMUTABLE_FIELDS.filter((f) => body[f] !== undefined);
  return found.length ? found : null;
};

const rejectEmptyStrings = (body) => {
  const empty = UPDATABLE_FIELDS.filter(
    (f) => typeof body[f] === "string" && body[f].trim() === "",
  );
  return empty.length ? empty : null;
};

// PATCH — partial update: at least one updatable field required.
export const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertValidId(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "You must provide a valid id parameter",
      });
    }

    const immutable = rejectImmutable(req.body || {});
    if (immutable) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: `These fields cannot be updated: ${immutable.join(", ")}`,
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "Provide at least one field to update",
      });
    }

    const empty = rejectEmptyStrings(req.body);
    if (empty) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: `These fields cannot be empty: ${empty.join(", ")}`,
      });
    }

    const profile = await Profile.findById(id);
    if (!profile || profile.isDeleted) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        message: "Artisan profile not found or invalid id provided",
      });
    }

    for (const field of UPDATABLE_FIELDS) {
      if (req.body[field] !== undefined) profile[field] = req.body[field];
    }

    await profile.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      message: "Artisan profile updated successfully",
      data: (({ rating: _legacy, ...rest }) => rest)(profile.toJSON()),
    });
  } catch (error) {
    return handleMongooseError(res, error);
  }
};

