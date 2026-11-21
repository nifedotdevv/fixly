// Only an explicit false is unverified; legacy accounts without the field are grandfathered as verified.
export const requireVerifiedEmail = (req, res, next) => {
  if (req.user?.emailVerified === false) {
    return res.status(403).json({ statusCode: 403, success: false, code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email address before performing this action." });
  }
  return next();
};
