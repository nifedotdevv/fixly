import mongoose from "mongoose";
import { PAYMENT_PURPOSES } from "../constants/serviceRequests.js";

export const REFUND_STATES = ["requesting", "pending", "processed", "failed", "needs_attention"];

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
    // Automatic resolutions (a processed Paystack refund) have no human resolver.
    automatic: Boolean,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, required() { return !this.automatic; } },
    resolvedAt: { type: Date, required: true },
  }, { _id: false, strict: "throw" }),
  // Automatic refund of a Paystack charge that could not count. See services/payments/refunds.js.
  refund: new mongoose.Schema({
    state: { type: String, enum: REFUND_STATES, required: true },
    providerRefundId: Number,
    amount: Number,
    currency: String,
    requestedAt: { type: Date, required: true },
    lastTriedAt: Date,
    checkedAt: Date,
    processedAt: Date,
    failureReason: { type: String, maxlength: 500 },
    tries: { type: Number, default: 0 },
  }, { _id: false, strict: "throw" }),
}, { timestamps: true, strict: "throw", read: "primary", writeConcern: { w: "majority" } });
schema.index({ homeowner: 1, outcome: 1 });
schema.index({ artisan: 1, outcome: 1 });
schema.index({ outcome: 1, "refund.state": 1 });
export default mongoose.model("PaymentEvent", schema);
