import { forgotPassword, resetPassword, changePassword, requestEmailChange, confirmEmailChange } from "../../services/credentials.js";
import { handleMongooseError, AccountLifecycleConflictError } from "../../utils/errors.js";

const action = (operation, message, authenticated = false) => async (req, res) => {
  try {
    await (authenticated ? operation(req.user, req.body) : operation(req.body));
    return res.status(200).json({ statusCode: 200, success: true, message });
  } catch (error) {
    if (error.statusCode || error.code === 11000 || error instanceof AccountLifecycleConflictError) return handleMongooseError(res, error);
    // Provider/database errors must not expose credential values even in development responses.
    return res.status(500).json({ statusCode: 500, success: false, message: "Internal Server Error" });
  }
};
export const forgotPasswordController = action(forgotPassword, "If this is an active account, a password reset email will be sent.");
export const resetPasswordController = action(resetPassword, "Password reset. Sign in with your new password.");
export const changePasswordController = action(changePassword, "Password changed. Sign in again.", true);
export const requestEmailChangeController = action(requestEmailChange, "Check your new email address for a confirmation link.", true);
export const confirmEmailChangeController = action(confirmEmailChange, "Email changed. Sign in with your new email address.");
