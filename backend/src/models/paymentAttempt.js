import mongoose from "mongoose";
import { PAYMENT_PURPOSES } from "../constants/serviceRequests.js";

// One checkout started with the payment provider. The _id is the provider reference we generated.
// An attempt is not a payment: only a verified provider result applied through applyVerifiedPayment() moves a booking.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  provider: { type: String, enum: ["paystack"], required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, required: true },
  homeowner: { type: mongoose.Schema.Types.ObjectId, required: true },
  purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
  amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
  accessCode: { type: String, required: true },
  // Set when this attempt's PaymentEvent is final, so the sweep stops checking it.
  settledAt: Date,
  // Last time the sweep asked Paystack about this attempt.
  checkedAt: Date,
}, { timestamps: true, strict: "throw", read: "primary", writeConcern: { w: "majority" } });
schema.index({ requestId: 1, purpose: 1, createdAt: -1 });
schema.index({ settledAt: 1, checkedAt: 1, createdAt: 1 });
export default mongoose.model("PaymentAttempt", schema);
