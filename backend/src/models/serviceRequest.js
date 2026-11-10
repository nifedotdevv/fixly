import mongoose from "mongoose";
import { REQUEST_STATUS, PAYMENT_PURPOSES } from "../constants/serviceRequests.js";

const { Schema } = mongoose;
const options = { _id: false, strict: "throw" };
const minorUnits = { type: Number, min: 1, required: true, validate: Number.isSafeInteger };
const currency = { type: String, required: true, match: /^[A-Z]{3}$/ };
const windowSchema = new Schema({ start: { type: Date, required: true }, end: { type: Date, required: true } }, options);
const moneySchema = new Schema({ amount: minorUnits, currency }, options);
const appointmentSchema = new Schema({
  window: { type: windowSchema, required: true },
  state: { type: String, enum: ["reserved", "confirmed", "completed", "released", "expired"], required: true },
  paymentDeadline: { type: Date, required: true },
  confirmedAt: Date, completedAt: Date,
}, options);
const quoteSchema = new Schema({
  scope: { type: String, required: true, maxlength: 4000 },
  total: { type: moneySchema, required: true },
  depositAmount: minorUnits,
  balanceAmount: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
  window: { type: windowSchema, required: true }, expiresAt: { type: Date, required: true },
  submittedAt: { type: Date, required: true }, approvedAt: Date, declinedAt: Date,
}, options);
const schema = new Schema({
  homeowner: { type: Schema.Types.ObjectId, required: true, immutable: true },
  artisan: { type: Schema.Types.ObjectId, required: true, immutable: true },
  description: { type: String, required: true, maxlength: 4000, immutable: true },
  serviceAddress: { type: String, required: true, maxlength: 1000, immutable: true },
  inspectionWindow: { type: windowSchema, required: true, immutable: true },
  responseDeadline: { type: Date, required: true, immutable: true },
  status: { type: String, enum: Object.values(REQUEST_STATUS), default: REQUEST_STATUS.PENDING, required: true },
  notes: { type: [new Schema({ text: { type: String, required: true, maxlength: 2000 }, createdAt: { type: Date, required: true } }, options)], default: [] },
  inspectionFee: moneySchema,
  inspection: appointmentSchema, repair: appointmentSchema, quote: quoteSchema,
  acceptedAt: Date, rejectedAt: Date, rejectionReason: String, cancelledAt: Date, expiredAt: Date,
  workStartedAt: Date, artisanCompletedAt: Date, homeownerConfirmedAt: Date, completedAt: Date,
  problem: new Schema({ explanation: { type: String, required: true }, reportedAt: { type: Date, required: true } }, options),
  verifiedPayments: { type: [new Schema({
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
    externalReference: { type: String, required: true }, amount: minorUnits, currency,
    recordedAt: { type: Date, required: true },
  }, options)], default: [] },
}, { timestamps: true, strict: "throw", optimisticConcurrency: true, read: "primary", writeConcern: { w: "majority" } });
schema.index({ homeowner: 1, createdAt: -1, _id: -1 });
schema.index({ artisan: 1, createdAt: -1, _id: -1 });
schema.index({ artisan: 1, "inspection.state": 1, "inspection.window.start": 1 });
schema.index({ artisan: 1, "repair.state": 1, "repair.window.start": 1 });
export default mongoose.model("ServiceRequest", schema);
