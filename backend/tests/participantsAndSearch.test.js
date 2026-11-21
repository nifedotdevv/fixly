import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-participants-and-search-test-key";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
process.env.SMTP_HOST = "sandbox.smtp.mailtrap.io";
process.env.SMTP_PORT = "2525";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASSWORD = "test-password";
process.env.MAIL_FROM = "Fixly <noreply@fixly.test>";
process.env.PASSWORD_RESET_URL = "https://fixly.test/reset-password";
process.env.EMAIL_CHANGE_URL = "https://fixly.test/confirm-email-change";
process.env.EMAIL_VERIFY_URL = "https://fixly.test/verify-email";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) await cleanupTestDatabase(mongoose.connection, databaseName);
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init(), Lock.init()]);

const hour = 3600000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const auth = (actor) => ({ Authorization: `Bearer ${generateToken(actor)}` });
const user = (role = "house_owner", extra = {}) => User.create({ firstName: "Test", lastName: "Person", email: `${randomUUID()}@fixly.test`,
  password: "unused-test-password", role, ...extra });
const profile = (u, extra = {}) => Profile.create({ user_id: u.id, professional_headline: "Experienced plumber", profession: "Plumber",
  experience_years: 3, phone_number: "08012345678", starting_price: 5000, residential_address: "Home", office_address: "Office", ...extra });

const bookingBody = (artisan) => ({ artisan: artisan.id, description: "Repair the leaking kitchen tap", serviceAddress: "12 Example Street",
  inspectionWindow: { start: iso(24 * hour), end: iso(25 * hour) }, responseDeadline: iso(hour) });
const keysOf = (value, found = []) => {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { found.push(key); keysOf(child, found); }
  return found;
};

describe("participant details in service requests", () => {
  const setup = async () => {
    const homeowner = await user("house_owner", { firstName: "Hope", lastName: "Owner", avatar: { url: "https://img.test/h.png", publicId: "h" } });
    const artisan = await user("artisan", { firstName: "Ade", lastName: "Fixer" });
    await profile(artisan);
    return { homeowner, artisan };
  };
  const assertParticipants = (body, { homeowner, artisan }) => {
    assert.equal(body.homeowner, homeowner.id);
    assert.equal(body.artisan, artisan.id);
    assert.deepEqual(body.participants.homeowner, { id: homeowner.id, firstName: "Hope", lastName: "Owner", name: "Hope Owner", avatar: { url: "https://img.test/h.png" } });
    assert.deepEqual(body.participants.artisan, { id: artisan.id, firstName: "Ade", lastName: "Fixer", name: "Ade Fixer", avatar: null });
    const keys = keysOf(body.participants);
    for (const forbidden of ["email", "phone", "phone_number", "password", "publicId", "role", "avatarVersion"]) assert.ok(!keys.includes(forbidden), forbidden);
  };

  it("includes id, name and avatar on create, get, list and mutation responses", async () => {
    const pair = await setup();
    const created = await request(app).post("/api/v1/service-requests").set(auth(pair.homeowner)).send(bookingBody(pair.artisan)).expect(201);
    assertParticipants(created.body.data, pair);
    const id = created.body.data.id;
    for (const actor of [pair.homeowner, pair.artisan]) {
      assertParticipants((await request(app).get(`/api/v1/service-requests/${id}`).set(auth(actor)).expect(200)).body.data, pair);
      const list = await request(app).get("/api/v1/service-requests").set(auth(actor)).expect(200);
      assertParticipants(list.body.data[0], pair);
    }
    const noted = await request(app).post(`/api/v1/service-requests/${id}/notes`).set(auth(pair.homeowner)).send({ text: "Ring the bell" }).expect(200);
    assertParticipants(noted.body.data, pair);
    const text = JSON.stringify(created.body) + JSON.stringify(noted.body);
    assert.ok(!text.includes(pair.homeowner.email) && !text.includes(pair.artisan.email));
    assert.ok(!text.includes("08012345678"));
  });

  it("keeps the request private to participants", async () => {
    const pair = await setup();
    const id = (await request(app).post("/api/v1/service-requests").set(auth(pair.homeowner)).send(bookingBody(pair.artisan)).expect(201)).body.data.id;
    const outsider = await user();
    await request(app).get(`/api/v1/service-requests/${id}`).set(auth(outsider)).expect(404);
    assert.equal((await request(app).get("/api/v1/service-requests").set(auth(outsider)).expect(200)).body.data.length, 0);
  });

  it("keeps the counterpart name for history after deactivation without leaking contact data", async () => {
    const pair = await setup();
    const id = (await request(app).post("/api/v1/service-requests").set(auth(pair.homeowner)).send(bookingBody(pair.artisan)).expect(201)).body.data.id;
    await User.updateOne({ _id: pair.artisan.id }, { isDeleted: true });
    const view = (await request(app).get(`/api/v1/service-requests/${id}`).set(auth(pair.homeowner)).expect(200)).body.data;
    assert.equal(view.participants.artisan.name, "Ade Fixer");
    assert.ok(!keysOf(view.participants).includes("email"));
  });
});

describe("artisan discovery by trade, skill, area and availability", () => {
  const list = async (query) => (await request(app).get(`/api/v1/artisan/profiles?${query}`).expect(200)).body;
  const tag = randomUUID().slice(0, 8);
  const make = async (extra, userExtra = {}) => profile(await user("artisan", userExtra), { professional_headline: `Pro ${tag}`, ...extra });
  const ids = (body) => body.data.map((p) => p.id).sort();
  let plumber, wirer, away, legacyOne;
  it("seeds profiles", async () => {
    plumber = await make({ skills: ["pipe fitting", "leak repair"], city: "lagos", serviceAreas: ["ikeja", "yaba"] });
    wirer = await make({ profession: "Electrician", skills: ["wiring"], city: "abuja", serviceAreas: ["wuse"] });
    away = await make({ skills: ["pipe fitting"], city: "lagos", isAvailable: false });
    legacyOne = await make({});
    await Profile.collection.updateOne({ _id: legacyOne._id }, { $unset: { isAvailable: "", skills: "", serviceAreas: "", city: "" } });
  });

  it("stores and returns normalized lowercase skills, city and areas via create and update", async () => {
    const artisan = await user("artisan");
    const body = { professional_headline: "Experienced plumber", profession: "Plumber", experience_years: 3, phone_number: "08012345678",
      starting_price: 5000, residential_address: "Home", office_address: "Office", skills: ["  Pipe   Fitting "], city: " Lagos ", serviceAreas: ["IKEJA"] };
    const created = await request(app).post("/api/v1/artisan/profile").set(auth(artisan)).send(body).expect(201);
    assert.deepEqual(created.body.data.skills, ["pipe fitting"]);
    assert.equal(created.body.data.city, "lagos");
    assert.deepEqual(created.body.data.serviceAreas, ["ikeja"]);
    assert.equal(created.body.data.isAvailable, true);
    const updated = await request(app).patch(`/api/v1/artisan/profile/${created.body.data.id}`).set(auth(artisan))
      .send({ isAvailable: false, skills: ["Tiling"] }).expect(200);
    assert.equal(updated.body.data.isAvailable, false);
    assert.deepEqual(updated.body.data.skills, ["tiling"]);
    const pub = await request(app).get(`/api/v1/artisan/profile/${created.body.data.id}`).expect(200);
    assert.equal(pub.body.data.city, "lagos");
    assert.equal(pub.body.data.phone_number, undefined);
  });

  it("validates new profile fields", async () => {
    const artisan = await user("artisan");
    const base = { professional_headline: "Experienced plumber", profession: "Plumber", experience_years: 3, phone_number: "08012345678",
      starting_price: 5000, residential_address: "Home", office_address: "Office" };
    for (const extra of [{ skills: Array.from({ length: 11 }, (_, i) => `skill ${i}`) }, { skills: ["a"] }, { skills: [{ $ne: 1 }] },
      { city: "x".repeat(61) }, { serviceAreas: "ikeja" }, { isAvailable: "maybe" }]) {
      await request(app).post("/api/v1/artisan/profile").set(auth(artisan)).send({ ...base, ...extra }).expect(400);
    }
  });

  it("filters by skill (case-insensitive, exact)", async () => {
    assert.deepEqual(ids(await list(`skill=Pipe%20Fitting&limit=100`)).filter((i) => [plumber.id, away.id, wirer.id].includes(i)), [plumber.id, away.id].sort());
    assert.equal((await list("skill=pipe")).data.length, 0);
  });

  it("filters by service area matching the city or a served area", async () => {
    const byCity = ids(await list("area=LAGOS&limit=100"));
    assert.ok(byCity.includes(plumber.id) && byCity.includes(away.id) && !byCity.includes(wirer.id));
    assert.deepEqual(ids(await list("area=yaba")), [plumber.id]);
    assert.deepEqual(ids(await list("area=wuse")), [wirer.id]);
  });

  it("filters by availability and treats legacy profiles as available", async () => {
    const on = ids(await list("available=true&limit=100")); const off = ids(await list("available=false&limit=100"));
    assert.ok(on.includes(plumber.id) && on.includes(legacyOne.id) && !on.includes(away.id));
    assert.deepEqual(off.filter((i) => [plumber.id, away.id, legacyOne.id].includes(i)), [away.id]);
    await request(app).get("/api/v1/artisan/profiles?available=yes").expect(400);
  });

  it("combines trade, skill, area and availability and paginates", async () => {
    assert.deepEqual(ids(await list("profession=Plumber&skill=pipe%20fitting&area=lagos&available=true")), [plumber.id]);
    assert.equal((await list("profession=Electrician&skill=pipe%20fitting")).data.length, 0);
    const page = await list("area=lagos&limit=1&page=2");
    assert.equal(page.data.length, 1);
    assert.equal(page.meta.page, 2);
    assert.ok(page.meta.total >= 2 && page.meta.limit === 1);
    assert.ok((await list("search=wiring")).data.some((p) => p.id === wirer.id));
  });

  it("rejects operator injection, repeated and oversized parameters, and treats regex characters literally", async () => {
    for (const q of ["skill[$ne]=x", "area[$regex]=.*", "skill=a&skill=b", "area=a&area=b", "available[$ne]=1", `skill=${"x".repeat(61)}`, "area[]=lagos"]) {
      await request(app).get(`/api/v1/artisan/profiles?${q}`).expect(400);
    }
    assert.equal((await list("skill=.*")).data.length, 0);
    assert.equal((await list("area=%5Elagos%24")).data.length, 0);
    assert.equal((await list("skill=(a%2B)%2B%24")).data.length, 0);
  });

  it("declares the discovery indexes", async () => {
    await Profile.init();
    const keys = (await Profile.collection.indexes()).map((i) => Object.keys(i.key).join(","));
    for (const expected of ["skills", "serviceAreas", "city", "isDeleted,profession,isAvailable,createdAt"]) assert.ok(keys.includes(expected), expected);
  });

  it("hides unavailable-for-directory accounts consistently: soft-deleted and unverified never appear even with filters", async () => {
    const ghost = await make({ skills: ["ghostskill"] }, { emailVerified: false });
    const gone = await make({ skills: ["ghostskill"] }, { isDeleted: true });
    assert.equal((await list("skill=ghostskill")).data.length, 0);
    assert.ok(ghost && gone);
  });
});
