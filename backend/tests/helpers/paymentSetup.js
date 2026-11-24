import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./database.js";
import { TEST_KEY } from "./fakePaystack.js";

// Shared app, database and booking helpers for the payment test files. Call once at the top of a file.
export const paymentTestSetup = async (secret) => {
  dotenv.config({ quiet: true });
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = secret;
  process.env.API_RATE_LIMIT_MAX = "10000";
  // Never the developer's real key: every test replaces the provider client.
  process.env.PAYSTACK_SECRET_KEY = TEST_KEY;
  const { default: app } = await import("../../src/index.js");
  const { default: User } = await import("../../src/models/users.js");
  const { default: Profile } = await import("../../src/models/artisanProfile.js");
  const { default: Booking } = await import("../../src/models/serviceRequest.js");
  const { default: PaymentEvent } = await import("../../src/models/paymentEvent.js");
  const { default: PaymentAttempt } = await import("../../src/models/paymentAttempt.js");
  const { default: Lock } = await import("../../src/models/accountLifecycleLock.js");
  const { generateToken } = await import("../../src/utils/jwt.js");
  const { paymentProvider } = await import("../../src/services/payments/paystack.js");
  const { flushDetached } = await import("../../src/services/backgroundTask.js");

  const databaseName = createTestDatabaseName();
  after(async () => {
    if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
  });
  await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
    dbName: databaseName, serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([User.init(), Profile.init(), Booking.init(), PaymentEvent.init(), PaymentAttempt.init(), Lock.init()]);

  const hour = 3600000;
  const iso = (offset) => new Date(Date.now() + offset).toISOString();
  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user)}` });
  const user = (role = "house_owner", extra = {}) => User.create({
    firstName: "Payment", lastName: "Tester", email: `${randomUUID()}@fixly.test`, password: "unused-test-password", role, ...extra,
  });
  const pair = async () => {
    const homeowner = await user(); const artisan = await user("artisan");
    await Profile.create({ user_id: artisan.id, professional_headline: "Experienced plumber", profession: "Plumber",
      experience_years: 3, phone_number: "08012345678", starting_price: 5000,
      residential_address: "Artisan home", office_address: "Artisan office" });
    return { homeowner, artisan };
  };
  const action = (id, actor, path, input = {}) => request(app).post(`/api/v1/service-requests/${id}/${path}`).set(auth(actor)).send(input);
  // A booking waiting for its inspection payment.
  const accepted = async (p) => {
    const id = (await request(app).post("/api/v1/service-requests").set(auth(p.homeowner)).send({
      artisan: p.artisan.id, description: "Repair the leaking kitchen tap", serviceAddress: "12 Example Street",
      inspectionWindow: { start: iso(24 * hour), end: iso(25 * hour) }, responseDeadline: iso(hour),
    }).expect(201)).body.data.id;
    await action(id, p.artisan, "accept", { inspectionFee: { amount: 250000, currency: "NGN" } }).expect(200);
    return id;
  };
  // Starts the inspection checkout and returns its reference.
  const checkout = async (p, id) => (await action(id, p.homeowner, "payments").expect(201)).body.data.reference;
  const confirm = (p, id, reference) => action(id, p.homeowner, `payments/${reference}/verify`);
  const eventFor = (reference) => PaymentEvent.findById(`paystack:${reference}`).lean();

  return {
    app, request, User, Booking, PaymentEvent, PaymentAttempt, paymentProvider, flushDetached,
    hour, auth, user, pair, action, accepted, checkout, confirm, eventFor,
  };
};
