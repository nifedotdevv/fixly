import express from "express";
import { updateMe } from "../controllers/users/updateMe.js";
import { getMe } from "../controllers/users/getMe.js";
import { deleteMe } from "../controllers/users/deleteMe.js";
import { requireAuth, requireOwnership } from "../middleware/authentication.js";
import User from "../models/users.js";
import rateLimit from "express-rate-limit";
import { getAvatar, putAvatar, deleteAvatar } from "../controllers/users/avatar.js";
import { uploadAvatar } from "../middleware/upload.js";

const router = express.Router();
const requireSelf = requireOwnership({ model: User, ownerField: "_id" });
const deletionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user._id.toString(),
  standardHeaders: true,
  legacyHeaders: false,
});
const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user._id.toString(),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    success: false,
    message: "Too many profile picture uploads. Please try again later.",
  },
});

router.get("/me", requireAuth, getMe);
router.delete("/me", requireAuth, deletionLimiter, deleteMe);
router.get("/me/avatar", requireAuth, getAvatar);
router.put("/me/avatar", requireAuth, avatarLimiter, uploadAvatar, putAvatar);
router.delete("/me/avatar", requireAuth, deleteAvatar);

router.patch("/:id", requireAuth, requireSelf, updateMe);

export default router;
