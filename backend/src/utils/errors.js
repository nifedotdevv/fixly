export const isDuplicateKey = (error) => error?.code === 11000;

export const isValidationError = (error) => error?.name === "ValidationError";

export const isCastError = (error) => error?.name === "CastError";

const isProduction = () => process.env.NODE_ENV === "production";

export class QueryValidationError extends Error {}

export class AccountLifecycleConflictError extends Error {
  constructor() {
    super("Another account lifecycle operation is in progress. Retry after it finishes.");
  }
}

export const handleMongooseError = (res, error) => {
  if (error.statusCode && Number.isInteger(error.statusCode)) {
    return res.status(error.statusCode).json({ statusCode: error.statusCode, success: false, message: error.message });
  }
  if (error.name === "VersionError") {
    return res.status(409).json({ statusCode: 409, success: false, message: "The request changed. Reload it and retry." });
  }
  if (error instanceof AccountLifecycleConflictError) {
    return res.status(409).json({
      statusCode: 409,
      success: false,
      message: error.message,
    });
  }
  if (error instanceof QueryValidationError) {
    return res.status(400).json({
      statusCode: 400,
      success: false,
      message: error.message,
    });
  }
  if (isDuplicateKey(error)) {
    return res.status(409).json({
      statusCode: 409,
      success: false,
      message: "Duplicate value: resource already exists",
    });
  }
  if (isValidationError(error) || isCastError(error)) {
    return res.status(400).json({
      statusCode: 400,
      success: false,
      message: error.message,
    });
  }
  return res.status(500).json({
    statusCode: 500,
    success: false,
    message: "Internal Server Error",
    ...(isProduction() ? {} : { error: error.message }),
  });
};
