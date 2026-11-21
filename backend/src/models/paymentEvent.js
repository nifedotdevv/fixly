import mongoose from "mongoose";
import { PAYMENT_PURPOSES } from "../constants/serviceRequests.js";

// The namespaced external reference is globally unique, including reconciliation outcomes.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, required: true },
  homeowner: { type: mongoose.Schema.Types.ObjectId, required: true },
  artisan: { type: mongoose.Schema.Types.ObjectId, required: true },
  purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
  amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
  outcome: { type: String, enum: ["processing", "applied", "reconciliation_required"], default: "processing" },
  reason: String,
  resolution: new mongoose.Schema({
    disposition: { type: String, enum: ["externally_refunded", "externally_settled"], required: true },
    resolutionReference: { type: String, required: true, maxlength: 200 },
    note: { type: String, required: true, maxlength: 2000 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    resolvedAt: { type: Date, required: true },
  }, { _id: false, strict: "throw" }),
}, { timestamps: true, strict: "throw", read: "primary", writeConcern: { w: "majority" } });
schema.index({ homeowner: 1, outcome: 1 });
schema.index({ artisan: 1, outcome: 1 });
export default mongoose.model("PaymentEvent", schema);
