import express from "express";
import { register } from "../controllers/auth/register.js";
import { login } from "../controllers/auth/login.js";
import { reactivate } from "../controllers/auth/reactivate.js";
import { validateRegistration, validateLogin } from "../middleware/validation.js";
//create or initialize an instance of express router
const router = express.Router()

//register endpoint
router.post("/register", validateRegistration, register)

//login endpoint
router.post("/login", validateLogin, login)
router.post("/reactivate", validateLogin, reactivate)

export default router
