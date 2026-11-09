import mongoose from "mongoose";

// The account id is the unique lock key, including for orphan-profile cleanup.
// No TTL: time alone cannot prove that the previous writer has stopped.
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  token: { type: String, required: true },
  action: { type: String, enum: ["delete", "soft-delete", "restore", "create-profile", "update-role"], required: true },
  startedAt: { type: Date, default: Date.now },
  host: { type: String, required: true },
  processId: { type: Number, required: true },
}, { versionKey: false });

export default mongoose.model("AccountLifecycleLock", schema);
