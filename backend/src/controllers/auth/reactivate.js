import User from "../../models/users.js";
import { runAccountLifecycle, setAccountDeletionState } from "../../services/accountLifecycle.js";
import { recoveryDeadline, verifiesPassword } from "../../services/accountRecoveryPolicy.js";
import { handleMongooseError } from "../../utils/errors.js";

const denied = (res) => res.status(401).json({
  statusCode: 401, success: false, message: "Account cannot be reactivated with these credentials",
});

export const reactivate = async (req, res) => {
  try {
    const { email, password } = req.body;
    const candidate = await User.findOne({ email }).select("+passwordByteLimit");
    if (!await verifiesPassword(candidate, password)) return denied(res);
    const response = await runAccountLifecycle(candidate._id, "restore", async () => {
      const user = await User.findById(candidate._id).select("+deletionReason +passwordByteLimit");
      const deadline = user && recoveryDeadline(user);
      if (!deadline || Date.now() >= deadline || !await verifiesPassword(user, password)) return null;
      return setAccountDeletionState(user._id, false);
    });
    if (!response) return denied(res);
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return handleMongooseError(res, error);
  }
};
