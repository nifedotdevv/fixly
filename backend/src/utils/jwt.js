import jwt from "jsonwebtoken";

export const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }
  return jwt.sign(
    { id: user._id, authVersion: user.authVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "12h" },
  );
};

export const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
