import Joi from "joi";

const id = Joi.string().pattern(/^[a-f\d]{24}$/i);
// Requiring an offset prevents interpreting a caller's local wall time as server time.
const timestamp = Joi.string().max(40).isoDate().strict()
  .pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  .custom((value, helpers) => {
    const [year, month, day, hour] = value.match(/\d+/g).map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1] && hour < 24 && Number.isFinite(Date.parse(value))
      ? value : helpers.message("Timestamp must be a real calendar date with an explicit timezone");
  });
const window = Joi.object({ start: timestamp.required(), end: timestamp.required() }).unknown(false);
const currency = Joi.string().valid(...Intl.supportedValuesOf("currency"));
const money = (minimum = 1) => Joi.object({
  amount: Joi.number().integer().min(minimum).max(Number.MAX_SAFE_INTEGER).strict().required(),
  currency: currency.required(),
}).unknown(false);
export const requestSchemas = {
  create: Joi.object({
    artisan: id.required(), description: Joi.string().trim().min(3).max(4000).required(),
    serviceAddress: Joi.string().trim().min(3).max(1000).required(),
    inspectionWindow: window.required(), responseDeadline: timestamp.required(),
  }),
  note: Joi.object({ text: Joi.string().trim().min(1).max(2000).required() }),
  accept: Joi.object({ inspectionFee: money().required() }),
  reject: Joi.object({ reason: Joi.string().trim().min(1).max(500).required() }),
  quote: Joi.object({
    scope: Joi.string().trim().min(3).max(4000).required(), total: money(4).required(),
    repairWindow: window.required(), expiresAt: timestamp.required(),
  }),
  problem: Joi.object({ explanation: Joi.string().trim().min(1).max(2000).required() }),
  empty: Joi.object({}),
};
export const validateRequestBody = (name) => (req, res, next) => {
  const { error, value } = requestSchemas[name].unknown(false).validate(req.body ?? {}, {
    abortEarly: false, stripUnknown: false,
  });
  if (error) return res.status(400).json({
    statusCode: 400, success: false, message: "Validation failed", errors: error.details.map((detail) => detail.message),
  });
  req.body = value;
  return next();
};
export const paymentEventSchema = Joi.object({
  requestId: id.required(), purpose: Joi.string().valid("inspection", "repair_deposit", "repair_balance").required(),
  amount: Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER).strict().required(), currency: currency.required(),
  externalReference: Joi.string().trim().min(1).max(200).required(),
}).unknown(false);
