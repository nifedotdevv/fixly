import mongoose from "mongoose";
import { handleMongooseError } from "../../utils/errors.js";
import { runAccountLifecycle, hardDeleteAccount, setAccountDeletionState } from "../../services/accountLifecycle.js";

const result = (statusCode, message, data) => ({
  statusCode,
  success: statusCode < 400,
  message,
  ...(data === undefined ? {} : { data }),
});

// Every lifecycle endpoint uses the same account lock and response handling.
const lifecycle = (action, operation) => async (req, res) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json(result(400, "You must provide a valid id parameter"));
  }
  try {
    const response = await runAccountLifecycle(id, action, () => operation(id));
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return handleMongooseError(res, error);
  }
};

export const deleteUser = lifecycle("delete", (id) => hardDeleteAccount(id));
const setDeletionState = (isDeleted) => lifecycle(isDeleted ? "soft-delete" : "restore",
  (id) => setAccountDeletionState(id, isDeleted, { deletionReason: "admin" }));

export const softDeleteUser = setDeletionState(true);
export const restoreUser = setDeletionState(false);
