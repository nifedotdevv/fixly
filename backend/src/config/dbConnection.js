import mongoose from "mongoose";

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const conn = await mongoose.connect(uri, { readPreference: "primary" });
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn;
};
