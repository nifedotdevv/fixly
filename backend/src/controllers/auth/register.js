import bcrypt from "bcryptjs";
import User from "../../models/users.js";
import { handleMongooseError, isDuplicateKey } from "../../utils/errors.js";
import { runAccountLifecycle, hardDeleteAccount } from "../../services/accountLifecycle.js";
import { recoveryDeadline, verifiesPassword } from "../../services/accountRecoveryPolicy.js";

const duplicate = () => ({
    statusCode: 409,
    success: false,
    message: "User with this email already exists!",
});

export const register = async (req, res) => {
    try {
        const { firstName, lastName, email, password, role, previousPassword } = req.body;
        const existing = await User.findOne({ email }).select("+passwordByteLimit +deletionReason");
        // A registration request must never erase an account just by naming its email.
        if (existing && (!recoveryDeadline(existing) || !await verifiesPassword(existing, previousPassword))) {
            return res.status(409).json(duplicate());
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const createAccount = async () => {
            const user = await User.create({
                firstName, lastName, email, password: hashedPassword, passwordByteLimit: 72, role,
            });
            return {
                statusCode: 201, success: true, message: "User registered Successfully",
                data: {
                    id: user._id, firstName: user.firstName, lastName: user.lastName,
                    email: user.email, role: user.role, avatar: null,
                },
            };
        };

        const response = existing
            ? await runAccountLifecycle(existing._id, "restart", async () => {
                const user = await User.findById(existing._id).select("+deletionReason +passwordByteLimit");
                // Recovery may have finished the old account's persisted deletion.
                if (!user) return createAccount();
                const deadline = user && recoveryDeadline(user);
                if (!deadline || !await verifiesPassword(user, previousPassword)) return duplicate();
                if (Date.now() < deadline) {
                    return {
                        statusCode: 409, success: false,
                        message: "This account is within its recovery grace period. Reactivate it with your existing credentials.",
                        data: { isDeactivated: true, daysRemaining: Math.ceil((deadline - Date.now()) / 86_400_000) },
                    };
                }
                const deletion = await hardDeleteAccount(user._id);
                if (!deletion.success) return deletion;
                return createAccount();
            })
            : await createAccount();
        return res.status(response.statusCode).json(response);
    } catch (error) {
        if (isDuplicateKey(error)) return res.status(409).json(duplicate());
        return handleMongooseError(res, error);
    }
};
