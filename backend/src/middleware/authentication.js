import mongoose from "mongoose";
import User from "../models/users.js";
import { verifyToken } from "../utils/jwt.js";

const unauthorized = (res, message) =>
  res.status(401).json({
    statusCode: 401,
    success: false,
    message,
  });

const forbidden = (res, message) =>
  res.status(403).json({
    statusCode: 403,
    success: false,
    message,
  });

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
};

export const requireAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return unauthorized(res, "Authentication required");
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      const message =
        error.name === "TokenExpiredError"
          ? "Token has expired"
          : "Invalid token";
      return unauthorized(res, message);
    }

    if (!decoded?.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return unauthorized(res, "Invalid token");
    }

    const user = await User.findById(decoded.id).select("-password +avatar.publicId +avatarVersion +authVersion");
    if (!user || user.isDeleted || (decoded.authVersion || 0) !== (user.authVersion || 0)) {
      return unauthorized(res, "User no longer exists or is deactivated");
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error(`Authentication error: ${error.message}`);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return next();

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      return next();
    }

    if (!decoded?.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return next();
    }

    const user = await User.findById(decoded.id).select("-password +authVersion");
    if (user && !user.isDeleted && (decoded.authVersion || 0) === (user.authVersion || 0)) {
      req.user = user;
    }

    return next();
  } catch {
    return next();
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return unauthorized(res, "Authentication required");
  }

  if (!roles.includes(req.user.role)) {
    return forbidden(res, "You do not have permission to perform this action");
  }

  return next();
};

export const requireOwnership = ({
  model,
  ownerField = "user_id",
  param = "id",
  bypassRoles = ["admin"],
}) => async (req, res, next) => {
  try {
    if (!req.user) {
      return unauthorized(res, "Authentication required");
    }

    if (bypassRoles.includes(req.user.role)) {
      return next();
    }

    const id = req.params[param];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return next();
    }

    const resource = await model.findById(id).select(ownerField);
    if (!resource) {
      return next();
    }

    const owner = resource[ownerField];
    const ownerId = owner?._id ?? owner;

    if (!ownerId || ownerId.toString() !== req.user._id.toString()) {
      return forbidden(
        res,
        "You do not have permission to modify this resource",
      );
    }

    return next();
  } catch (error) {
    console.error(`Authorization error: ${error.message}`);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      message: "Internal Server Error",
    });
  }
};
