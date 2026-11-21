import { createHash } from "node:crypto";
import rateLimit from "express-rate-limit";

const settings = { windowMs: 15 * 60000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { statusCode: 429, success: false, message: "Too many credential requests. Please try again later." } };
// IP throttling applies even when authenticated endpoints have a general API limiter elsewhere.
export const credentialIpLimit = rateLimit(settings);
export const credentialAccountLimit = rateLimit({ ...settings, keyGenerator: (req) => req.user._id.toString() });
export const forgotAddressLimit = rateLimit({ ...settings, limit: 5,
  keyGenerator: (req) => createHash("sha256").update(req.body.email).digest("hex") });
