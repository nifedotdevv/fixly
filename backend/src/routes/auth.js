import express from "express";
import { register } from "../controllers/auth/register.js";
import { login } from "../controllers/auth/login.js";
import { reactivate } from "../controllers/auth/reactivate.js";
import { validateRegistration, validateLogin } from "../middleware/validation.js";
import { forgotPasswordController, resetPasswordController, confirmEmailChangeController, verifyEmailController, resendVerificationController, logoutAllController } from "../controllers/auth/credentials.js";
import { validateCredentials } from "../validation/credentials.js";
import { requireAuth } from "../middleware/authentication.js";
import { credentialIpLimit, credentialAccountLimit, forgotAddressLimit } from "../middleware/credentialLimits.js";
//create or initialize an instance of express router
const router = express.Router()

//register endpoint
router.post("/register", validateRegistration, register)

//login endpoint
router.post("/login", validateLogin, login)
router.post("/reactivate", validateLogin, reactivate)
router.post("/forgot-password", credentialIpLimit, validateCredentials("forgot"), forgotAddressLimit, forgotPasswordController);
router.post("/reset-password", credentialIpLimit, validateCredentials("reset"), resetPasswordController);
router.post("/confirm-email-change", credentialIpLimit, validateCredentials("confirmEmail"), confirmEmailChangeController);
router.post("/verify-email", credentialIpLimit, validateCredentials("confirmEmail"), verifyEmailController);
router.post("/resend-verification", requireAuth, credentialIpLimit, credentialAccountLimit, validateCredentials("empty"), resendVerificationController);
router.post("/logout-all", requireAuth, credentialIpLimit, credentialAccountLimit, validateCredentials("empty"), logoutAllController);

export default router
