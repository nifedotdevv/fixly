import crypto from "node:crypto";

// Thin Paystack client: initialize a transaction, verify it, refund it, and check webhook signatures.
// It never decides whether a booking is paid; callers pass verified results to applyVerifiedPayment().
// Amounts are integers in the currency's minor unit (kobo for NGN), as Paystack expects.

const BASE_URL = "https://api.paystack.co";
const TIMEOUT_MS = 15000;
const KEY_PATTERN = /^sk_(test|live)_[A-Za-z0-9]+$/;
// Paystack accepts alphanumerics, hyphen, period and equals in references.
const REFERENCE_PATTERN = /^[A-Za-z0-9.=-]{1,100}$/;

const fail = (message, statusCode, code, extra = {}) => Object.assign(new Error(message), { statusCode, code, ...extra });
const unavailable = () => fail("Online payment is unavailable right now. Please try again later.", 503, "PAYMENT_UNAVAILABLE");
const logFailure = (method, path, providerStatus, providerMessage) => {
  if (process.env.NODE_ENV !== "test") console.error(`[paystack] ${method} ${path} failed: ${providerStatus} ${providerMessage}`);
};
const providerError = (providerMessage, providerStatus) => fail(
  "The payment provider could not complete this request. Please try again.", 502, "PAYMENT_PROVIDER_ERROR",
  { providerMessage, providerStatus },
);

// Reads PAYSTACK_SECRET_KEY. A live key is refused outside production so development can never charge real cards.
export const paystackSettings = (env = process.env) => {
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim();
  const match = secretKey && KEY_PATTERN.exec(secretKey);
  if (!match) throw unavailable();
  const mode = match[1];
  if (mode === "live" && env.NODE_ENV !== "production") throw unavailable();
  return { secretKey, mode };
};

const requireReference = (reference) => {
  if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference)) throw fail("Invalid payment reference", 400, "INVALID_PAYMENT_REFERENCE");
  return reference;
};
const requireAmount = (amount) => {
  if (!Number.isSafeInteger(amount) || amount < 1) throw fail("Invalid payment amount", 400, "INVALID_PAYMENT_AMOUNT");
  return amount;
};
const requireCurrency = (currency) => {
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) throw fail("Invalid payment currency", 400, "INVALID_PAYMENT_CURRENCY");
  return currency;
};

const requireId = (id) => {
  if (!Number.isSafeInteger(id) || id < 1) throw fail("Invalid provider id", 400, "INVALID_PROVIDER_ID");
  return id;
};
// Paystack returns the refunded transaction as an id or an object, depending on the endpoint.
const refundView = (data) => ({
  id: data.id, status: data.status, amount: data.amount, currency: data.currency,
  transactionId: typeof data.transaction === "object" && data.transaction ? data.transaction.id ?? null : data.transaction ?? null,
});

const transactionView = (data) => ({
  id: data.id,
  reference: data.reference,
  status: data.status,
  amount: data.amount,
  currency: data.currency,
  paidAt: data.paid_at ?? data.paidAt ?? null,
  channel: data.channel ?? null,
  metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
});

export const createPaystackClient = ({ secretKey, fetch = globalThis.fetch, baseUrl = BASE_URL, timeoutMs = TIMEOUT_MS } = {}) => {
  if (!secretKey) throw unavailable();

  const request = async (method, path, body) => {
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${secretKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error?.name === "TimeoutError" ? "Request timed out" : "Network error";
      logFailure(method, path, 0, reason);
      throw providerError(reason, 0);
    }
    let json;
    try { json = await response.json(); } catch { json = null; }
    if (!response.ok || json?.status !== true || !json.data) {
      const message = typeof json?.message === "string" ? json.message.slice(0, 200) : `HTTP ${response.status}`;
      logFailure(method, path, response.status, message);
      throw providerError(message, response.status);
    }
    return json.data;
  };

  return {
    // Starts a transaction. The popup resumes it with accessCode; the amount cannot be changed client-side.
    async initialize({ email, amount, currency, reference, metadata = {}, callbackUrl }) {
      if (typeof email !== "string" || !email.includes("@")) throw fail("A payer email is required", 400, "INVALID_PAYMENT_EMAIL");
      const data = await request("POST", "/transaction/initialize", {
        email,
        amount: requireAmount(amount),
        currency: requireCurrency(currency),
        reference: requireReference(reference),
        metadata,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      });
      return { accessCode: data.access_code, authorizationUrl: data.authorization_url, reference: data.reference };
    },

    // Paystack's own record of the transaction. Only status "success" means the money was taken.
    async verify(reference) {
      const data = await request("GET", `/transaction/verify/${encodeURIComponent(requireReference(reference))}`);
      return transactionView(data);
    },

    // Full refund unless amount is given (partial refunds are in minor units too).
    async refund({ reference, amount, reason }) {
      const data = await request("POST", "/refund", {
        transaction: requireReference(reference),
        ...(amount === undefined ? {} : { amount: requireAmount(amount) }),
        ...(reason ? { merchant_note: String(reason).slice(0, 200) } : {}),
      });
      return refundView(data);
    },

    // Paystack's own record of one refund: pending, processing, processed, failed or needs-attention.
    async fetchRefund(id) {
      return refundView(await request("GET", `/refund/${requireId(id)}`));
    },

    // Refunds already made against one transaction (by Paystack's numeric transaction id).
    async listRefunds(transactionId) {
      const data = await request("GET", `/refund?transaction=${requireId(transactionId)}`);
      return Array.isArray(data) ? data.map(refundView) : [];
    },
  };
};

// Object method is deliberately mockable in tests, like credentialMail.
export const paymentProvider = {
  client: () => createPaystackClient({ secretKey: paystackSettings().secretKey }),
};

// Paystack signs the raw request body with HMAC-SHA512 using the secret key (x-paystack-signature header).
// rawBody must be the exact bytes received; a re-serialised JSON object will not match.
export const verifyWebhookSignature = (rawBody, signature, secretKey) => {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !secretKey) return false;
  if (!/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha512", secretKey).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
};
