import express from "express";
import { fetchUsers } from "../controllers/admin/getUsers.js";
import { fetchUser } from "../controllers/admin/getUser.js";
import { updateUser } from "../controllers/admin/updateUser.js";
import { deleteUser, softDeleteUser, restoreUser } from "../controllers/admin/deleteUser.js";
import { requireAuth, requireRole } from "../middleware/authentication.js";
import { listSupportProblems, getSupportRequest, listSupportPayments, resolveSupportProblem, resolveSupportPayment } from "../controllers/admin/support.js";
const router = express.Router()

router.use(requireAuth, requireRole("admin"));

router.get("/support/requests", listSupportProblems);
router.get("/support/requests/:id", getSupportRequest);
router.post("/support/requests/:id/resolve", resolveSupportProblem);
router.get("/support/payments", listSupportPayments);
router.post("/support/payments/resolve", resolveSupportPayment);

router.get("/users", fetchUsers)
router.get("/user/:id", fetchUser)
router.patch("/user/:id", updateUser)
router.patch("/user/:id/soft-delete", softDeleteUser)
router.patch("/user/:id/restore", restoreUser)
router.delete("/user/:id", deleteUser)


export default router
