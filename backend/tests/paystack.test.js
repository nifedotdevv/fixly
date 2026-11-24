import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPaystackClient, paystackSettings, verifyWebhookSignature } from "../src/services/payments/paystack.js";

const KEY = "sk_test_abc123";

// Records each call and answers with the queued responses.
const fakeFetch = (...responses) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status < 400, status: next.status, json: async () => next.json };
  };
  fn.calls = calls;
  return fn;
};
const ok = (data) => ({ status: 200, json: { status: true, message: "ok", data } });

describe("paystackSettings", () => {
  it("accepts a test key in any environment", () => {
    assert.deepEqual(paystackSettings({ PAYSTACK_SECRET_KEY: KEY, NODE_ENV: "development" }), { secretKey: KEY, mode: "test" });
    assert.equal(paystackSettings({ PAYSTACK_SECRET_KEY: KEY, NODE_ENV: "production" }).mode, "test");
  });

  it("refuses a live key outside production", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      assert.throws(() => paystackSettings({ PAYSTACK_SECRET_KEY: "sk_live_abc", NODE_ENV }), { statusCode: 503, code: "PAYMENT_UNAVAILABLE" });
    }
    assert.equal(paystackSettings({ PAYSTACK_SECRET_KEY: "sk_live_abc", NODE_ENV: "production" }).mode, "live");
  });

  it("refuses a missing or malformed key", () => {
    for (const PAYSTACK_SECRET_KEY of [undefined, "", "pk_test_abc", "sk_test_", "sk_test_ab c"]) {
      assert.throws(() => paystackSettings({ PAYSTACK_SECRET_KEY }), { statusCode: 503 });
    }
  });
});

describe("Paystack client", () => {
  it("initializes with the bearer key, kobo amount and reference, and returns the access code", async () => {
    const fetch = fakeFetch(ok({ access_code: "ac_1", authorization_url: "https://checkout.paystack.com/ac_1", reference: "fx-ref-1" }));
    const client = createPaystackClient({ secretKey: KEY, fetch });
    const result = await client.initialize({
      email: "home@example.test", amount: 500000, currency: "NGN", reference: "fx-ref-1", metadata: { requestId: "r1", purpose: "inspection" },
    });
    assert.deepEqual(result, { accessCode: "ac_1", authorizationUrl: "https://checkout.paystack.com/ac_1", reference: "fx-ref-1" });
    const [call] = fetch.calls;
    assert.equal(call.url, "https://api.paystack.co/transaction/initialize");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.Authorization, `Bearer ${KEY}`);
    assert.deepEqual(call.body, {
      email: "home@example.test", amount: 500000, currency: "NGN", reference: "fx-ref-1", metadata: { requestId: "r1", purpose: "inspection" },
    });
  });

  it("rejects bad input before calling Paystack", async () => {
    const fetch = fakeFetch();
    const client = createPaystackClient({ secretKey: KEY, fetch });
    const base = { email: "a@b.test", amount: 100, currency: "NGN", reference: "ok-ref" };
    await assert.rejects(client.initialize({ ...base, amount: 10.5 }), { code: "INVALID_PAYMENT_AMOUNT" });
    await assert.rejects(client.initialize({ ...base, amount: 0 }), { code: "INVALID_PAYMENT_AMOUNT" });
    await assert.rejects(client.initialize({ ...base, currency: "ngn" }), { code: "INVALID_PAYMENT_CURRENCY" });
    await assert.rejects(client.initialize({ ...base, reference: "bad/ref" }), { code: "INVALID_PAYMENT_REFERENCE" });
    await assert.rejects(client.initialize({ ...base, email: "nope" }), { code: "INVALID_PAYMENT_EMAIL" });
    await assert.rejects(client.verify("../transaction/x"), { code: "INVALID_PAYMENT_REFERENCE" });
    assert.equal(fetch.calls.length, 0);
  });

  it("verifies by reference and normalises the transaction", async () => {
    const fetch = fakeFetch(ok({
      id: 42, reference: "fx-ref-1", status: "success", amount: 500000, currency: "NGN", paid_at: "2026-11-24T10:00:00.000Z",
      channel: "card", metadata: { requestId: "r1" }, customer: { email: "x@y.test" }, authorization: { last4: "4081" },
    }));
    const client = createPaystackClient({ secretKey: KEY, fetch });
    assert.deepEqual(await client.verify("fx-ref-1"), {
      id: 42, reference: "fx-ref-1", status: "success", amount: 500000, currency: "NGN",
      paidAt: "2026-11-24T10:00:00.000Z", channel: "card", metadata: { requestId: "r1" },
    });
    assert.equal(fetch.calls[0].url, "https://api.paystack.co/transaction/verify/fx-ref-1");
    assert.equal(fetch.calls[0].init.method, "GET");
    assert.equal(fetch.calls[0].init.body, undefined);
  });

  it("refunds in full by default, or a partial amount", async () => {
    const fetch = fakeFetch(ok({ id: 7, status: "pending", amount: 500000, currency: "NGN", transaction: { id: 42, reference: "fx-ref-1" } }),
      ok({ id: 8, status: "pending", amount: 100, currency: "NGN", transaction: 42 }));
    const client = createPaystackClient({ secretKey: KEY, fetch });
    assert.deepEqual(await client.refund({ reference: "fx-ref-1", reason: "Paid after the booking expired" }),
      { id: 7, status: "pending", amount: 500000, currency: "NGN", transactionId: 42 });
    assert.deepEqual(fetch.calls[0].body, { transaction: "fx-ref-1", merchant_note: "Paid after the booking expired" });
    await client.refund({ reference: "fx-ref-1", amount: 100 });
    assert.deepEqual(fetch.calls[1].body, { transaction: "fx-ref-1", amount: 100 });
  });

  it("fetches one refund and lists a transaction's refunds by Paystack id", async () => {
    const fetch = fakeFetch(ok({ id: 7, status: "processed", amount: 500000, currency: "NGN", transaction: 42 }),
      ok([{ id: 7, status: "processed", amount: 500000, currency: "NGN", transaction: { id: 42 } }]));
    const client = createPaystackClient({ secretKey: KEY, fetch });
    assert.deepEqual(await client.fetchRefund(7), { id: 7, status: "processed", amount: 500000, currency: "NGN", transactionId: 42 });
    assert.equal(fetch.calls[0].url, "https://api.paystack.co/refund/7");
    assert.deepEqual(await client.listRefunds(42), [{ id: 7, status: "processed", amount: 500000, currency: "NGN", transactionId: 42 }]);
    assert.equal(fetch.calls[1].url, "https://api.paystack.co/refund?transaction=42");
    for (const bad of [0, -1, 1.5, "7", "7/../x", undefined]) {
      await assert.rejects(client.fetchRefund(bad), { code: "INVALID_PROVIDER_ID" });
      await assert.rejects(client.listRefunds(bad), { code: "INVALID_PROVIDER_ID" });
    }
    assert.equal(fetch.calls.length, 2);
  });

  it("turns provider failures into a 502 without leaking the provider message to users", async () => {
    const client = createPaystackClient({ secretKey: KEY, fetch: fakeFetch({ status: 400, json: { status: false, message: "Duplicate Transaction Reference" } }) });
    await assert.rejects(client.verify("fx-ref-1"), (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.code, "PAYMENT_PROVIDER_ERROR");
      assert.doesNotMatch(error.message, /Duplicate/);
      assert.equal(error.providerMessage, "Duplicate Transaction Reference");
      assert.equal(error.providerStatus, 400);
      return true;
    });
  });

  it("treats status:false, a non-JSON body and network errors as provider errors", async () => {
    const statusFalse = createPaystackClient({ secretKey: KEY, fetch: fakeFetch({ status: 200, json: { status: false, message: "Nope" } }) });
    await assert.rejects(statusFalse.verify("r"), { statusCode: 502 });
    const badJson = createPaystackClient({ secretKey: KEY, fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } }) });
    await assert.rejects(badJson.verify("r"), { statusCode: 502 });
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const network = createPaystackClient({ secretKey: KEY, fetch: fakeFetch(timeout) });
    await assert.rejects(network.verify("r"), { statusCode: 502, providerMessage: "Request timed out" });
  });

  it("needs a secret key", () => {
    assert.throws(() => createPaystackClient({}), { statusCode: 503 });
  });
});

describe("verifyWebhookSignature", () => {
  const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "fx-ref-1" } }));
  const sign = (raw, key = KEY) => crypto.createHmac("sha512", key).update(raw).digest("hex");

  it("accepts the HMAC-SHA512 of the exact raw body", () => {
    assert.equal(verifyWebhookSignature(body, sign(body), KEY), true);
    assert.equal(verifyWebhookSignature(body, sign(body).toUpperCase(), KEY), true);
  });

  it("rejects a wrong key, a changed body, or a malformed signature", () => {
    assert.equal(verifyWebhookSignature(body, sign(body, "sk_test_other"), KEY), false);
    const tampered = Buffer.from(body.toString().replace("fx-ref-1", "fx-ref-2"));
    assert.equal(verifyWebhookSignature(tampered, sign(body), KEY), false);
    assert.equal(verifyWebhookSignature(body, "abc", KEY), false);
    assert.equal(verifyWebhookSignature(body, undefined, KEY), false);
    assert.equal(verifyWebhookSignature(body, sign(body), ""), false);
  });

  it("only accepts raw bytes, never a parsed object", () => {
    assert.equal(verifyWebhookSignature(JSON.parse(body.toString()), sign(body), KEY), false);
    assert.equal(verifyWebhookSignature(body.toString(), sign(body), KEY), false);
  });
});
