import mongoose from "mongoose";
import User from "../../models/users.js";
import { handleMongooseError } from "../../utils/errors.js";

const ALLOWED_FIELDS = ["firstName", "lastName"];

// PATCH /api/v1/users/:id — self-service update for any role.
// Email/password/role changes are rejected here (dedicated endpoints later).
export const updateMe = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "You must provide a valid id parameter",
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "Provide at least one field to update",
      });
    }

    const updates = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: `Allowed fields: ${ALLOWED_FIELDS.join(", ")}`,
      });
    }

    const user = await User.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    return handleMongooseError(res, error);
  }
};
