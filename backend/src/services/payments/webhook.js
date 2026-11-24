import PaymentAttempt from "../../models/paymentAttempt.js";
import { loadRequest } from "../requests/serviceRequests.js";
import { requireCondition } from "../requests/rules.js";
import { settleAttempt } from "./checkout.js";
import { handleRefundWebhook } from "./refunds.js";
import { paymentProvider, paystackSettings, verifyWebhookSignature } from "./paystack.js";
import { isOurReference } from "./references.js";

// Paystack webhook. Order matters:
// 1. The signature over the exact raw bytes is checked before anything is parsed or read.
// 2. The payload is only used to learn which of OUR references to look at again. Its status, amount and metadata
//    are never trusted: Paystack's verify API decides, and the request and purpose come from our stored attempt.
// 3. Anything that is not ours, or not a payment or refund event, is acknowledged and ignored.
// Every write path is idempotent, so retries, replays and races with the popup confirmation are safe.
export const handlePaystackWebhook = async (rawBody, signature) => {
  const { secretKey } = paystackSettings();
  requireCondition(verifyWebhookSignature(rawBody, signature, secretKey), "Invalid signature", 401, "INVALID_WEBHOOK_SIGNATURE");
  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8")); } catch { payload = null; }
  requireCondition(payload && typeof payload === "object" && !Array.isArray(payload), "Invalid payload", 400, "INVALID_WEBHOOK_PAYLOAD");

  const { event, data } = payload;
  if (event === "charge.success") return settleCharge(data);
  if (typeof event === "string" && event.startsWith("refund.")) return handleRefundWebhook(data);
  return "ignored";
};

const settleCharge = async (data) => {
  const reference = data?.reference;
  if (!isOurReference(reference)) return "ignored";
  const attempt = await PaymentAttempt.findById(reference);
  if (!attempt) return "ignored";
  const record = await loadRequest(attempt.requestId.toString());
  const transaction = await paymentProvider.client().verify(reference);
  // null: Paystack's own record does not (yet) say paid. The sweep checks the attempt again later.
  return (await settleAttempt(attempt, record, transaction)) ?? "not_paid";
};
