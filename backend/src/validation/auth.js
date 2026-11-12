import Joi from "joi";
import bcrypt from "bcryptjs";
import { PROFESSIONS } from "../constants/professions.js";

const registerValidationSchema = Joi.object({
  firstName: Joi.string().trim().required().messages({
    "string.base": "First Name must be a text",
    "string.empty": "First Name cannot be empty",
    "any.required": "First Name is required",
  }),
  lastName: Joi.string().trim().required(),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: Joi.string()
    .min(10)
    .max(100)
    .required()
    .custom((value, helpers) => bcrypt.truncates(value)
      ? helpers.message("Password must not exceed 72 UTF-8 bytes")
      : value)
    .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,100}$")),
  confirmPassword: Joi.any().valid(Joi.ref("password")).messages({
    "any.only": "Passwords do not match",
  }),
  previousPassword: Joi.string().max(100).optional(),
  role: Joi.string()
    .valid("house_owner", "artisan")
    .default("house_owner")
    .messages({
      "any.only": "Role must be either house_owner or artisan",
    }),
});
// adding fields as required 
const loginValidationSchema = Joi.object({
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required(),
});

//
const profileCreateSchema = Joi.object({
  user_id: Joi.any().forbidden().messages({
    "any.unknown": "Profile ownership is determined by the authenticated user",
  }),
  professional_headline: Joi.string().trim().min(3).required().messages({
    "string.base": "Professional Headline must be a text",
    "string.empty": "Professional Headline cannot be empty",
    "any.required": "professional Headline is required",
  }),
  profession: Joi.string()
    .required()
    .valid(...PROFESSIONS)
    .messages({
      "any.only": `Profession must be one of the following: ${PROFESSIONS.join(", ")}`,
    }),
  experience_years: Joi.number().min(0).required().messages({
    "number.base": "Experience years must be a number",
    "number.min": "Experience years cannot be negative",
    "any.required": "Experience years is required",
  }),
  rating: Joi.any().forbidden().messages({
    "any.unknown": "Ratings cannot be supplied when creating a profile",
  }),
  phone_number: Joi.string().trim().min(7).required(),
  starting_price: Joi.number().min(0).required(),
  residential_address: Joi.string().trim().min(3).required(),
  office_address: Joi.string().trim().min(3).required(),
});

const profileUpdateSchema = Joi.object({
  professional_headline: Joi.string().trim().min(3),
  profession: Joi.string().valid(...PROFESSIONS).messages({
    "any.only": `Profession must be one of the following: ${PROFESSIONS.join(", ")}`,
  }),
  experience_years: Joi.number().min(0).messages({
    "number.base": "Experience years must be a number",
    "number.min": "Experience years cannot be negative",
  }),
  phone_number: Joi.string().trim().min(7),
  starting_price: Joi.number().min(0),
  residential_address: Joi.string().trim().min(3),
  office_address: Joi.string().trim().min(3),
  user_id: Joi.any().forbidden().messages({
    "any.unknown": "user_id cannot be updated",
  }),
  rating: Joi.any().forbidden().messages({
    "any.unknown": "rating cannot be updated",
  }),
  _id: Joi.any().forbidden().messages({
    "any.unknown": "_id cannot be updated",
  }),
  __v: Joi.any().forbidden().messages({
    "any.unknown": "__v cannot be updated",
  }),
})
  .min(1)
  .messages({ "object.min": "Provide at least one field to update" });

export { registerValidationSchema, loginValidationSchema, profileCreateSchema, profileUpdateSchema };
