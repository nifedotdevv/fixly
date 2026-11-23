import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import multer from "multer";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { connectDB } from "./config/dbConnection.js";
import { configureCloudinary } from "./config/cloudinary.js";
import { recoverPendingAccountLifecycles } from "./services/accountLifecycleRecovery.js";
import { startAvatarCleanupSweep } from "./services/avatarCleanupSweep.js";
import { expireServiceRequests } from "./services/requests/rules.js";
import { startBackgroundTask } from "./services/backgroundTask.js";
import { positiveInteger } from "./config/backgroundJobs.js";
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

if (process.env.TRUST_PROXY) {
  const trustProxy = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isNaN(trustProxy) ? process.env.TRUST_PROXY : trustProxy);
}

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


// Importing the app is side-effect free; direct execution retains normal startup.
export const startServer = async ({ host, port = Number(process.env.PORT || 5000) } = {}) => {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing in environment");
    if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
        throw new Error("MONGODB_URI (or MONGO_URI) is missing in environment");
    }
    const jobs = [];
    let server;
    let shutdownPromise;
    const shutdown = () => shutdownPromise ||= (async () => {
        const closed = server?.listening
            ? new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
            : Promise.resolve();
        try {
            await Promise.all([closed, ...jobs.map((job) => job.stop())]);
        } finally {
            await mongoose.disconnect();
        }
    })();
    try {
        await connectDB();
        await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
        if (!configureCloudinary()) console.warn("Cloudinary not configured - upload endpoints will return 503");
        positiveInteger("SOFT_DELETE_GRACE_DAYS", 30, 3650);
        const recoveryInterval = positiveInteger("LIFECYCLE_RECOVERY_INTERVAL_MS", 60_000, 86_400_000);
        const expiryInterval = positiveInteger("REQUEST_EXPIRY_SWEEP_INTERVAL_MS", 60_000, 86_400_000);
        jobs.push(startAvatarCleanupSweep());
        jobs.push(startBackgroundTask(recoverPendingAccountLifecycles, recoveryInterval, { runImmediately: true }));
        jobs.push(startBackgroundTask(() => expireServiceRequests(), expiryInterval));
        await new Promise((resolve, reject) => {
            server = app.listen({ host, port });
            server.once("error", reject);
            server.once("listening", () => {
                server.off("error", reject);
                resolve();
            });
        });
        return { server, shutdown, address: server.address() };
    } catch (error) {
        await shutdown();
        throw error;
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.env.NODE_ENV !== "test") {
    startServer().then(({ address, shutdown }) => {
        console.log(`Server is running on ${address.port}`);
        for (const signal of ["SIGTERM", "SIGINT"]) {
            process.once(signal, () => shutdown().catch((error) => {
                console.error("Shutdown failed:", error.name);
                process.exitCode = 1;
            }));
        }
    }).catch((error) => {
        console.error("Server startup failed:", error.name);
        process.exitCode = 1;
    });
}

export default app;
