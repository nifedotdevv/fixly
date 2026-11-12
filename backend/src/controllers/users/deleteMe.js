import User from "../../models/users.js";
import { runAccountLifecycle, setAccountDeletionState } from "../../services/accountLifecycle.js";
import { verifiesPassword } from "../../services/accountRecoveryPolicy.js";
import { handleMongooseError } from "../../utils/errors.js";

export const deleteMe = async (req, res) => {
  try {
    const response = await runAccountLifecycle(req.user._id, "soft-delete", async () => {
      const user = await User.findById(req.user._id).select("+passwordByteLimit");
      if (!user || user.isDeleted || !await verifiesPassword(user, req.body?.password)) {
        return { statusCode: 401, success: false, message: "Invalid email or password" };
      }
      return setAccountDeletionState(user._id, true, { deletionReason: "self", invalidateSessions: true });
    });
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return handleMongooseError(res, error);
  }
};
