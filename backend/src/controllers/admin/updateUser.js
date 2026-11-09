import mongoose from "mongoose";
import User from "../../models/users.js";
import Profile from "../../models/artisanProfile.js";
import { runAccountLifecycle } from "../../services/accountLifecycle.js";
import { handleMongooseError } from "../../utils/errors.js";

const ALLOWED_FIELDS = ["firstName", "lastName", "role"];

const updateAccount = async (id, updates) => {
  const existing = await User.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!existing) {
    return {
      statusCode: 404,
      success: false,
      message: "User not found",
    };
  }

  if (
    updates.role !== undefined &&
    updates.role !== "artisan" &&
    await Profile.exists({ user_id: id })
  ) {
    return {
      statusCode: 409,
      success: false,
      message: "An account with an artisan profile must retain the artisan role",
    };
  }

  const user = await User.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, updates, {
    returnDocument: "after",
    runValidators: true,
  }).select("-password");

  if (!user) {
    return {
      statusCode: 404,
      success: false,
      message: "User not found",
    };
  }

  return {
    statusCode: 200,
    success: true,
    message: "User updated successfully",
    data: user,
  };
};

// PATCH /api/v1/admin/user/:id — admin edits any user.
export const updateUser = async (req, res) => {
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

    const operation = () => updateAccount(id, updates);
    const response = updates.role === undefined
      ? await operation()
      : await runAccountLifecycle(id, "update-role", operation);
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return handleMongooseError(res, error);
  }
};
