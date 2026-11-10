import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { connectDB } from "./config/dbConnection.js";
import { configureCloudinary } from "./config/cloudinary.js";
import authRoutes from "./routes/auth.js";
import artisanRoutes from "./routes/artisan.js";
import adminRoutes from "./routes/admin.js";
import usersRoutes from "./routes/users.js";
import uploadsRoutes from "./routes/uploads.js";
import serviceRequestRoutes from "./routes/serviceRequests.js";

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "10kb" }));
app.use(morgan("dev"));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/", (req, res) => {
  res.send("Welcome to my Backend Server");
});

app.use("/api/v1", apiLimiter);
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/artisan", artisanRoutes)
app.use("/api/v1/admin", adminRoutes)
app.use("/api/v1/users", usersRoutes)
app.use("/api/v1/uploads", uploadsRoutes)
app.use("/api/v1/service-requests", serviceRequestRoutes);

app.use((req, res) => {
    return res.status(404).json({
        statusCode: 404,
        success: false,
        message: "Route not found",
    });
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        const message = status === 413 ? "File is too large (max 5MB)" : error.message;
        return res.status(status).json({
            statusCode: status,
            success: false,
            message,
        });
    }
    if (error.http_code) {
        const providerStatus = Number(error.http_code);
        const status = providerStatus >= 500 || [401, 403, 408, 420, 429, 499].includes(providerStatus)
            ? 503
            : 400;
        return res.status(status).json({
            statusCode: status,
            success: false,
            message: status === 503 ? "Image storage is unavailable. Please try again later." : "Image upload failed",
        });
    }
    const status = error.statusCode || 500;
    if (status >= 500) {
        console.error(`Unhandled error: ${error.message}`);
    }
    return res.status(status).json({
        statusCode: status,
        success: false,
        message: status === 500 ? "Internal Server Error" : error.message,
    });
});


const PORT = process.env.PORT || 5000;
const start = async () => {
    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is missing in environment");
        process.exit(1);
    }
    if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
        console.error("MONGODB_URI (or MONGO_URI) is missing in environment");
        process.exit(1);
    }
    await connectDB(); // Connect to MongoDB before accepting traffic
    if (!configureCloudinary()) {
        console.warn("Cloudinary not configured - upload endpoints will return 503");
    }
    app.listen(PORT, () => {
        console.log(`Server is running on ${PORT}`);
    });
};

if (process.env.NODE_ENV !== "test") {
    start();
}

export default app;
