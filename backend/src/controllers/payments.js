import { handlePaystackWebhook } from "../services/payments/webhook.js";

const reply = (res, statusCode, message) => res.status(statusCode).json({ statusCode, success: statusCode === 200, message });

// Paystack retries any non-200 for up to 72 hours, so only answer 200 once the event is fully handled.
// Bad signatures and payloads get a 4xx; everything else that fails is a 5xx so Paystack tries again.
export const paystackWebhook = async (req, res) => {
  try {
    await handlePaystackWebhook(req.body, req.get("x-paystack-signature"));
    return reply(res, 200, "Received");
  } catch (error) {
    if (error.code === "INVALID_WEBHOOK_SIGNATURE") return reply(res, 401, "Invalid signature");
    if (error.code === "INVALID_WEBHOOK_PAYLOAD") return reply(res, 400, "Invalid payload");
    if (error.code === "PAYMENT_UNAVAILABLE") return reply(res, 503, "Payments are not configured");
    // Never log the body or the signature.
    if (process.env.NODE_ENV !== "test") console.error(`[paystack] webhook failed: ${error.name} ${error.code ?? ""} ${error.statusCode ?? ""}`);
    return reply(res, 500, "Webhook could not be processed");
  }
};
