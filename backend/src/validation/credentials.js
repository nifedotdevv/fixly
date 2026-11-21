import Joi from "joi";
import bcrypt from "bcryptjs";

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).required();
const password = Joi.string().min(10).max(100).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,100}$/)
  .custom((value, helpers) => bcrypt.truncates(value) ? helpers.message("Password must not exceed 72 UTF-8 bytes") : value).required();
const currentPassword = Joi.string().max(4096).required();
const token = Joi.string().pattern(/^[a-f0-9]{64}$/).required();
const schemas = {
  forgot: Joi.object({ email }),
  reset: Joi.object({ token, password, confirmPassword: Joi.string().valid(Joi.ref("password")) }),
  password: Joi.object({ currentPassword, password, confirmPassword: Joi.string().valid(Joi.ref("password")) }),
  email: Joi.object({ currentPassword, email }),
  empty: Joi.object({}),
  confirmEmail: Joi.object({ token }),
};
export const validateCredentials = (kind) => (req, res, next) => {
  const { error, value } = schemas[kind].validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ statusCode: 400, success: false, message: "Validation failed",
    // Joi pattern errors can echo password/token values; return fixed field labels only.
    errors: error.details.map(({ path }) => ["email", "password", "confirmPassword", "currentPassword", "token"].includes(path[0])
      ? `${path[0]} is invalid` : "Request contains unsupported fields") });
  req.body = value;
  next();
};
