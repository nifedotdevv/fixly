import dotenv from "dotenv";
import {
  createTestDatabaseName,
  cleanupTestDatabase,
} from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-integration-test-secret";
process.env.MONGODB_URI_TEST ??= "mongodb://127.0.0.1:27017/fixly-backend-test";
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST;
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.API_RATE_LIMIT_MAX = "1000";

const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const PASSWORD = "StrongPass123";
const stamp = Date.now();

const register = (body) =>
  request(app).post("/api/v1/auth/register").send(body);

const login = (email, password = PASSWORD) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const jsonOf = (payload) =>
  JSON.parse(Buffer.from(payload.split(".")[1], "base64url").toString("utf8"));

const testDatabaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await cleanupTestDatabase(mongoose.connection, testDatabaseName);
  }
});

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: testDatabaseName,
  serverSelectionTimeoutMS: 5000,
});
assert.equal(mongoose.connection.name, testDatabaseName);
await Promise.all([User.init(), Profile.init()]);

const hashed = await bcrypt.hash("Admin#Pass123", await bcrypt.genSalt(4));
const admin = await User.create({
  firstName: "Ada",
  lastName: "Admin",
  email: `admin-${stamp}@fixly.test`,
  password: hashed,
  role: "admin",
});

describe("Fixly API", () => {
  it("GET / responds with 200", async () => {
    const res = await request(app).get("/").expect(200);
    assert.match(res.text, /Welcome/);
  });

  it("registers a house_owner by default when role omitted", async () => {
    const res = await register({
      firstName: "Eve",
      lastName: "Home",
      email: `owner-${stamp}@fixly.test`,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    }).expect(201);
    assert.equal(res.body.data.role, "house_owner");
  });

  it("rejects weak passwords", async () => {
    const res = await register({
      firstName: "Weak",
      lastName: "Pass",
      email: `weak-${stamp}@fixly.test`,
      password: "short",
    }).expect(400);
    assert.ok(res.body.errors.length > 0);
  });

  it("rejects passwords exceeding bcrypt's byte limit without creating accounts", async () => {
    const passwords = ["Aa1" + "x".repeat(70), "Aa1" + "é".repeat(35)];
    for (const [index, password] of passwords.entries()) {
      const email = `oversize-password-${stamp}-${index}@fixly.test`;
      const res = await register({ firstName: "Long", lastName: "Password", email, password }).expect(400);
      assert.ok(res.body.errors.some((message) => message.includes("72 UTF-8 bytes")));
      assert.equal(await User.exists({ email }), null);
    }
  });

  it("accepts a 72-byte password and checks its last byte on login", async () => {
    const email = `password-boundary-${stamp}@fixly.test`;
    const password = "Aa1" + "x".repeat(69);
    await register({ firstName: "Boundary", lastName: "Password", email, password }).expect(201);
    await login(email, password).expect(200);
    await login(email, password.slice(0, -1) + "y").expect(401);
    await login(email, password + "ignored-suffix").expect(401);
  });

  it("preserves login for legacy accounts with passwords longer than 72 bytes", async () => {
    const email = `legacy-password-${stamp}@fixly.test`;
    const password = "Aa1" + "x".repeat(75);
    await User.create({
      firstName: "Legacy", lastName: "Password", email,
      password: await bcrypt.hash(password, 4),
    });
    await login(email, password).expect(200);
  });

  it("rejects public admin registration without creating an account", async () => {
    const email = `public-admin-${stamp}@fixly.test`;
    await register({
      firstName: "Public",
      lastName: "Admin",
      email,
      password: PASSWORD,
      role: "admin",
    }).expect(400);
    assert.equal(await User.exists({ email }), null);
  });

  it("rejects mismatched confirmPassword", async () => {
    const res = await register({
      firstName: "Mis",
      lastName: "Match",
      email: `mismatch-${stamp}@fixly.test`,
      password: PASSWORD,
      confirmPassword: "Different123",
    }).expect(400);
    assert.ok(
      res.body.errors.some((e) => e.toLowerCase().includes("password")),
    );
  });

  it("authenticates the default user and issues a roleless token", async () => {
    const res = await login(`owner-${stamp}@fixly.test`).expect(200);
    assert.ok(res.body.data.token);
    const payload = jsonOf(res.body.data.token);
    assert.equal(payload.role, undefined);
    assert.ok(payload.id);
  });

  it("returns 401 with a generic message for wrong password", async () => {
    const res = await login(`owner-${stamp}@fixly.test`, "WrongPass123").expect(401);
    assert.equal(res.body.message, "Invalid email or password");
  });

  it("returns 401 for unknown accounts without leaking existence", async () => {
    const res = await login(`ghost-${stamp}@fixly.test`).expect(401);
    assert.equal(res.body.message, "Invalid email or password");
  });

  it("hides database failure details in production login responses and logs", async (t) => {
    const environment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    t.after(() => { process.env.NODE_ENV = environment; });
    t.mock.method(User, "findOne", () => {
      throw new Error("mongodb://private-user:private-password@internal-db");
    });
    const logger = t.mock.method(console, "error", () => {});
    const res = await login(`owner-${stamp}@fixly.test`).expect(500);
    assert.deepEqual(res.body, {
      statusCode: 500,
      success: false,
      message: "Internal Server Error",
    });
    assert.equal(logger.mock.callCount(), 1);
    assert.doesNotMatch(JSON.stringify(logger.mock.calls), /private-password/);
  });

  it("hides token generation errors from login responses", async (t) => {
    const expiresIn = process.env.JWT_EXPIRES_IN;
    process.env.JWT_EXPIRES_IN = "invalid-duration";
    t.after(() => {
      if (expiresIn === undefined) delete process.env.JWT_EXPIRES_IN;
      else process.env.JWT_EXPIRES_IN = expiresIn;
    });
    t.mock.method(console, "error", () => {});
    const res = await login(`owner-${stamp}@fixly.test`).expect(500);
    assert.deepEqual(res.body, {
      statusCode: 500,
      success: false,
      message: "Internal Server Error",
    });
  });

  it("sends rate-limit headers on auth responses", async () => {
    const res = await login(`owner-${stamp}@fixly.test`).expect(200);
    assert.ok(
      res.headers["ratelimit-policy"] || res.headers["ratelimit"],
    );
  });

  describe("self-service user updates", () => {
    let ownerId;
    let otherId;
    let ownerToken;

    it("requires authentication", async () => {
      const user = await User.findOne({ email: `owner-${stamp}@fixly.test` });
      ownerId = user._id.toString();
      otherId = admin._id.toString();
      await request(app)
        .patch(`/api/v1/users/${ownerId}`)
        .send({ firstName: "Evan" })
        .expect(401);
    });

    it("lets a user update themselves", async () => {
      const res = await login(`owner-${stamp}@fixly.test`).expect(200);
      ownerToken = res.body.data.token;
      await request(app)
        .patch(`/api/v1/users/${ownerId}`)
        .set(bearer(ownerToken))
        .send({ firstName: "Evan" })
        .expect(200)
        .expect((r) => assert.equal(r.body.data.firstName, "Evan"));
    });

    it("rejects updates with disallowed fields only", async () => {
      await request(app)
        .patch(`/api/v1/users/${ownerId}`)
        .set(bearer(ownerToken))
        .send({ email: "taken@fixly.test" })
        .expect(400);
    });

    it("forbids updating another user", async () => {
      await request(app)
        .patch(`/api/v1/users/${otherId}`)
        .set(bearer(ownerToken))
        .send({ firstName: "Hacked" })
        .expect(403);
    });
  });

  describe("artisan profiles", () => {
    let artisanToken;
    let technicianToken;
    let profileId;

    it("registers artisans", async () => {
      const first = await register({
        firstName: "Ada",
        lastName: "Artisan",
        email: `artisan-${stamp}@fixly.test`,
        password: PASSWORD,
        role: "artisan",
      }).expect(201);
      const second = await register({
        firstName: "Bob",
        lastName: "Builder",
        email: `technician-${stamp}@fixly.test`,
        password: PASSWORD,
        role: "artisan",
      }).expect(201);
      artisanToken = (await login(`artisan-${stamp}@fixly.test`)).body.data.token;
      technicianToken = (await login(`technician-${stamp}@fixly.test`)).body.data.token;
      assert.ok(artisanToken && second.body.data.role && first.body.data.role);
    });

    it("rejects profile creation without authentication", async () => {
      const user = await User.findOne({ email: `artisan-${stamp}@fixly.test` });
      await request(app)
        .post("/api/v1/artisan/profile")
        .send({ user_id: user._id.toString(), professional_headline: "Home plumbing", profession: "Plumber", experience_years: 3, phone_number: "08012345678", starting_price: 5000, residential_address: "12 Allen Ave", office_address: "12 Allen Ave" })
        .expect(401);
    });

    it("rejects profile creation for non-artisan users", async () => {
      const ownerToken = (await login(`owner-${stamp}@fixly.test`)).body.data.token;
      const res = await request(app)
        .post("/api/v1/artisan/profile")
        .set(bearer(ownerToken))
        .send({ professional_headline: "Home plumbing", profession: "Plumber", experience_years: 3, phone_number: "08012345678", starting_price: 5000, residential_address: "12 Allen Ave", office_address: "12 Allen Ave" })
        .expect(403);
      assert.match(res.body.message, /permission/i);
    });

    it("rejects supplied ownership even when it names the caller", async () => {
      const caller = await User.findOne({ email: `artisan-${stamp}@fixly.test` });
      const other = await User.findOne({ email: `technician-${stamp}@fixly.test` });
      for (const user of [caller, other]) {
        await request(app)
          .post("/api/v1/artisan/profile")
          .set(bearer(artisanToken))
          .send({ user_id: user._id.toString(), professional_headline: "Home plumbing", profession: "Plumber", experience_years: 3, phone_number: "08012345678", starting_price: 5000, residential_address: "12 Allen Ave", office_address: "12 Allen Ave" })
          .expect(400);
        assert.equal(await Profile.exists({ user_id: user._id }), null);
      }
    });

    it("rejects self-assigned ratings without creating a profile", async () => {
      const user = await User.findOne({ email: `artisan-${stamp}@fixly.test` });
      await request(app)
        .post("/api/v1/artisan/profile")
        .set(bearer(artisanToken))
        .send({ rating: [5, 5, 5], professional_headline: "Expert home plumbing", profession: "Plumber", experience_years: 5, phone_number: "08012345678", starting_price: 5000, residential_address: "12 Allen Ave", office_address: "12 Allen Ave" })
        .expect(400);
      assert.equal(await Profile.exists({ user_id: user._id }), null);
    });

    it("lets an artisan create their profile and prevents duplicates", async () => {
      const user = await User.findOne({ email: `artisan-${stamp}@fixly.test` });
      const res = await request(app)
        .post("/api/v1/artisan/profile")
        .set(bearer(artisanToken))
        .send({ professional_headline: "Expert home plumbing", profession: "Plumber", experience_years: 5, phone_number: "08012345678", starting_price: 5000, residential_address: "12 Allen Ave", office_address: "12 Allen Ave" })
        .expect(201);
      profileId = res.body.data.id;
      assert.equal(res.body.data.user_id, user._id.toString());
      assert.deepEqual(res.body.data.rating, []);
      assert.equal(res.body.data.profession, "Plumber");
      await request(app)
        .post("/api/v1/artisan/profile")
        .set(bearer(artisanToken))
        .send({ professional_headline: "Duplicate", profession: "Plumber", experience_years: 5, phone_number: "08012345678", starting_price: 5000, residential_address: "12 Allen Ave", office_address: "12 Allen Ave" })
        .expect(409);
    });

    it("lists profiles publicly", async () => {
      const res = await request(app).get("/api/v1/artisan/profiles").expect(200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].user_id.firstName, "Ada");
      assert.equal(res.body.data[0].phone_number, undefined);
    });

    it("treats dangerous search input as literal text", async () => {
      const res = await request(app)
        .get("/api/v1/artisan/profiles?search=(a+)+$")
        .expect(200);
      assert.equal(res.body.data.length, 0);
      const hit = await request(app)
        .get("/api/v1/artisan/profiles?search=expert%20home")
        .expect(200);
      assert.equal(hit.body.data.length, 1);
    });

    it("validates profession and clamps limit queries", async () => {
      await request(app)
        .get("/api/v1/artisan/profiles?profession=Doctor")
        .expect(400);
      await request(app)
        .get("/api/v1/artisan/profiles?limit=-5&page=0")
        .expect(200)
        .expect((r) => {
          assert.equal(r.body.meta.limit, 1);
          assert.equal(r.body.meta.page, 1);
        });
    });

    it("rejects malformed and repeated list queries with 400", async () => {
      for (const query of [
        "search=one&search=two", "profession=Plumber&profession=Painter",
        "sortBy=createdAt&sortBy=starting_price", "order=asc&order=desc",
        `search=${"x".repeat(201)}`, `page=${"9".repeat(400)}`,
        "page=1000001", "page=1.5", "page=1&page=2", "limit=10junk",
        "limit=1&limit=2", "limit=", "page=9007199254740992",
      ]) {
        const res = await request(app).get(`/api/v1/artisan/profiles?${query}`).expect(400);
        assert.equal(res.body.success, false);
        assert.equal(res.body.error, undefined);
      }
      await request(app).get("/api/v1/artisan/profiles?page=1&limit=999")
        .expect(200).expect((res) => assert.equal(res.body.meta.limit, 100));
    });

    it("returns 400 for invalid profile ids", async () => {
      await request(app)
        .get("/api/v1/artisan/profile/not-an-objectid")
        .expect(400);
    });

    it("requires ownership for profile updates", async () => {
      await request(app)
        .patch(`/api/v1/artisan/profile/${profileId}`)
        .send({ professional_headline: "No auth" })
        .expect(401);
      await request(app)
        .patch(`/api/v1/artisan/profile/${profileId}`)
        .set(bearer(technicianToken))
        .send({ professional_headline: "Not mine" })
        .expect(403);
    });

    it("lets the owner update their profile", async () => {
      await request(app)
        .patch(`/api/v1/artisan/profile/${profileId}`)
        .set(bearer(artisanToken))
        .send({ professional_headline: "Legendary plumber", starting_price: 7000 })
        .expect(200)
        .expect((r) => assert.equal(r.body.data.starting_price, 7000));
    });

    it("rejects rating updates without applying other changes", async () => {
      await request(app)
        .patch(`/api/v1/artisan/profile/${profileId}`)
        .set(bearer(artisanToken))
        .send({ rating: [5], starting_price: 1 })
        .expect(400);
      const profile = await Profile.findById(profileId);
      assert.deepEqual(profile.rating.toObject(), []);
      assert.equal(profile.starting_price, 7000);
    });

    it("rejects updates on soft-deleted profiles", async () => {
      await Profile.updateOne(
        { _id: profileId },
        { isDeleted: true, deletedAt: new Date() },
      );
      await request(app)
        .patch(`/api/v1/artisan/profile/${profileId}`)
        .set(bearer(artisanToken))
        .send({ professional_headline: "Ghost work" })
        .expect(404);
      await Profile.updateOne(
        { _id: profileId },
        { isDeleted: false, deletedAt: null },
      );
    });

    it("creates only one profile when the owner sends concurrent requests", async () => {
      const body = { professional_headline: "Expert electrical repairs", profession: "Electrician", experience_years: 5, phone_number: "08012345678", starting_price: 5000, residential_address: "12 Allen Ave", office_address: "12 Allen Ave" };
      const results = await Promise.all([1, 2].map(() => request(app)
        .post("/api/v1/artisan/profile")
        .set(bearer(technicianToken))
        .send(body)));
      assert.deepEqual(results.map((res) => res.status).sort(), [201, 409]);
      const user = await User.findOne({ email: `technician-${stamp}@fixly.test` });
      assert.equal(await Profile.countDocuments({ user_id: user._id }), 1);
    });
  });

  describe("admin management", () => {
    let adminToken;
    let technicianToken;
    let technicianId;

    const createArtisan = async (label) => {
      const user = await User.create({
        firstName: "Test",
        lastName: "Artisan",
        email: `${label}-${stamp}@fixly.test`,
        password: hashed,
        role: "artisan",
      });
      const profile = await Profile.create({
        user_id: user._id,
        professional_headline: "Lifecycle test artisan",
        profession: "Plumber",
        experience_years: 3,
        phone_number: "08012345678",
        starting_price: 5000,
        residential_address: "12 Allen Ave",
        office_address: "12 Allen Ave",
      });
      return { user, profile };
    };

    const assertHidden = async (profile) => {
      await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(404);
      const list = await request(app).get("/api/v1/artisan/profiles?limit=100").expect(200);
      assert.ok(!list.body.data.some((item) => item.id === profile.id));
      assert.equal(list.body.meta.total, list.body.data.length);
    };

    it("requires admin role", async () => {
      adminToken = (await login(`admin-${stamp}@fixly.test`, "Admin#Pass123")).body.data.token;
      technicianToken = (await login(`technician-${stamp}@fixly.test`)).body.data.token;
      await request(app).get("/api/v1/admin/users").expect(401);
      await request(app)
        .get("/api/v1/admin/users")
        .set(bearer(technicianToken))
        .expect(403);
      await request(app)
        .get("/api/v1/admin/users")
        .set(bearer(adminToken))
        .expect(200);
    });

    it("validates pagination on admin lists before querying MongoDB", async () => {
      for (const query of ["page=1000001", "page=1&page=2", "limit=NaN", `page=${"9".repeat(400)}`]) {
        await request(app).get(`/api/v1/admin/users?${query}`).set(bearer(adminToken)).expect(400);
      }
      await request(app).get("/api/v1/admin/users?page=1&limit=999").set(bearer(adminToken))
        .expect(200).expect((res) => assert.equal(res.body.meta.limit, 100));
    });

    it("fetches a single user with their artisan profile", async () => {
      const technician = await User.findOne({ email: `technician-${stamp}@fixly.test` });
      technicianId = technician._id.toString();
      const res = await request(app)
        .get(`/api/v1/admin/user/${technicianId}`)
        .set(bearer(adminToken))
        .expect(200);
      assert.equal(res.body.data.email, `technician-${stamp}@fixly.test`);
      assert.equal(res.body.data.artisanProfile.user_id, technicianId);
      assert.equal(res.body.data.isDeleted, false);
    });

    it("updates a user as admin", async () => {
      await request(app)
        .patch(`/api/v1/admin/user/${technicianId}`)
        .set(bearer(adminToken))
        .send({ firstName: "Roberta" })
        .expect(200)
        .expect((r) => assert.equal(r.body.data.firstName, "Roberta"));
    });

    it("allows an existing admin to promote an account without a profile", async () => {
      const user = await User.create({
        firstName: "New",
        lastName: "Admin",
        email: `promoted-${stamp}@fixly.test`,
        password: hashed,
        role: "house_owner",
      });
      await request(app)
        .patch(`/api/v1/admin/user/${user.id}`)
        .set(bearer(technicianToken))
        .send({ role: "admin" })
        .expect(403);
      await request(app)
        .patch(`/api/v1/admin/user/${user.id}`)
        .set(bearer(adminToken))
        .send({ role: "admin" })
        .expect(200);
      const token = (await login(user.email, "Admin#Pass123").expect(200)).body.data.token;
      await request(app).get("/api/v1/admin/users").set(bearer(token)).expect(200);
    });

    it("rejects moving an account away from artisan while any profile exists", async () => {
      for (const isDeleted of [false, true]) {
        await Profile.updateOne({ user_id: technicianId }, { isDeleted });
        for (const role of ["house_owner", "admin"]) {
          await request(app)
            .patch(`/api/v1/admin/user/${technicianId}`)
            .set(bearer(adminToken))
            .send({ role, firstName: "Must not change" })
            .expect(409);
        }
        const user = await User.findById(technicianId);
        assert.equal(user.role, "artisan");
        assert.equal(user.firstName, "Roberta");
      }
      await Profile.updateOne({ user_id: technicianId }, { isDeleted: false });
    });

    it("soft-deletes, hides, and restores a user", async () => {
      await request(app)
        .patch(`/api/v1/admin/user/${technicianId}/soft-delete`)
        .set(bearer(adminToken))
        .expect(200);
      await login(`technician-${stamp}@fixly.test`).expect(401);
      const profile = await Profile.findOne({ user_id: technicianId });
      assert.equal(profile.isDeleted, true);
      await assertHidden(profile);
      const details = await request(app)
        .get(`/api/v1/admin/user/${technicianId}?includeDeleted=true`)
        .set(bearer(adminToken))
        .expect(200);
      assert.equal(details.body.data.isDeleted, true);
      assert.equal(details.body.data.artisanProfile.isDeleted, true);
      assert.equal(details.body.data.deletedAt, details.body.data.artisanProfile.deletedAt);
      await request(app)
        .patch(`/api/v1/admin/user/${technicianId}`)
        .set(bearer(adminToken))
        .send({ firstName: "Inactive update" })
        .expect(404);
      const hidden = await request(app)
        .get("/api/v1/admin/users")
        .set(bearer(adminToken))
        .expect(200);
      assert.ok(
        !hidden.body.data.some((u) => u.id === technicianId),
      );
      await request(app)
        .get(`/api/v1/admin/users?includeDeleted=true`)
        .set(bearer(adminToken))
        .expect(200)
        .expect((r) =>
          assert.ok(r.body.data.some((u) => u.id === technicianId)),
        );
      await request(app)
        .patch(`/api/v1/admin/user/${technicianId}/restore`)
        .set(bearer(adminToken))
        .expect(200);
      await login(`technician-${stamp}@fixly.test`).expect(200);
      assert.equal((await Profile.findById(profile._id)).isDeleted, false);
      await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(200);
    });

    it("cascades deletion and restoration for legacy role mismatches", async () => {
      const { user, profile } = await createArtisan("legacy-role");
      await User.updateOne({ _id: user._id }, { role: "house_owner" });
      await assertHidden(profile);
      await request(app)
        .patch(`/api/v1/admin/user/${user.id}/soft-delete`)
        .set(bearer(adminToken))
        .expect(200);
      assert.equal((await Profile.findById(profile._id)).isDeleted, true);
      await request(app)
        .patch(`/api/v1/admin/user/${user.id}/restore`)
        .set(bearer(adminToken))
        .expect(200);
      assert.equal((await Profile.findById(profile._id)).isDeleted, false);
      await assertHidden(profile);
      await request(app)
        .delete(`/api/v1/admin/user/${user.id}`)
        .set(bearer(adminToken))
        .expect(200);
      assert.equal(await Profile.findById(profile._id), null);
    });

    it("hides a deactivated owner immediately and repairs a failed soft-delete on retry", async (t) => {
      const { user, profile } = await createArtisan("soft-delete-retry");
      const fault = t.mock.method(Profile, "updateOne", async () => {
        throw new Error("simulated profile write failure");
      });
      await request(app)
        .patch(`/api/v1/admin/user/${user.id}/soft-delete`)
        .set(bearer(adminToken))
        .expect(500);
      fault.mock.restore();
      assert.equal((await Profile.findById(profile._id)).isDeleted, false);
      const deleted = await User.findById(user._id);
      assert.equal(deleted.isDeleted, true);
      await assertHidden(profile);
      for (let attempt = 0; attempt < 2; attempt++) {
        await request(app)
          .patch(`/api/v1/admin/user/${user.id}/soft-delete`)
          .set(bearer(adminToken))
          .expect(200);
      }
      const repaired = await Profile.findById(profile._id);
      assert.equal(repaired.isDeleted, true);
      assert.equal(repaired.deletedAt.toISOString(), deleted.deletedAt.toISOString());
    });

    it("repairs a failed restore on retry", async (t) => {
      const { user, profile } = await createArtisan("restore-retry");
      await request(app)
        .patch(`/api/v1/admin/user/${user.id}/soft-delete`)
        .set(bearer(adminToken))
        .expect(200);
      const fault = t.mock.method(Profile, "updateOne", async () => {
        throw new Error("simulated profile write failure");
      });
      await request(app)
        .patch(`/api/v1/admin/user/${user.id}/restore`)
        .set(bearer(adminToken))
        .expect(500);
      fault.mock.restore();
      assert.equal((await User.findById(user._id)).isDeleted, false);
      assert.equal((await Profile.findById(profile._id)).isDeleted, true);
      await assertHidden(profile);
      for (let attempt = 0; attempt < 2; attempt++) {
        await request(app)
          .patch(`/api/v1/admin/user/${user.id}/restore`)
          .set(bearer(adminToken))
          .expect(200);
      }
      const restored = await Profile.findById(profile._id);
      assert.equal(restored.isDeleted, false);
      assert.equal(restored.deletedAt, null);
      await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(200);
    });

    it("hides orphaned profiles and finishes hard deletion on retry", async (t) => {
      const { user, profile } = await createArtisan("hard-delete-retry");
      const fault = t.mock.method(Profile, "deleteOne", async () => {
        throw new Error("simulated profile delete failure");
      });
      await request(app)
        .delete(`/api/v1/admin/user/${user.id}`)
        .set(bearer(adminToken))
        .expect(500);
      fault.mock.restore();
      assert.equal((await User.findById(user._id)).isDeleted, true);
      assert.notEqual(await Profile.findById(profile._id), null);
      await assertHidden(profile);
      await request(app)
        .delete(`/api/v1/admin/user/${user.id}`)
        .set(bearer(adminToken))
        .expect(200);
      assert.equal(await Profile.findById(profile._id), null);
      await request(app)
        .delete(`/api/v1/admin/user/${user.id}`)
        .set(bearer(adminToken))
        .expect(404);
    });

    it("hard-deletes a user and their profile for good", async () => {
      await register({
        firstName: "Gone",
        lastName: "Forever",
        email: `doomed-${stamp}@fixly.test`,
        password: PASSWORD,
        role: "artisan",
      }).expect(201);
      const doomed = await User.findOne({ email: `doomed-${stamp}@fixly.test` });
      const doomedId = doomed._id.toString();
      const profile = await Profile.create({
        user_id: doomed._id,
        professional_headline: "Profile to cascade delete",
        profession: "Plumber",
        experience_years: 3,
        phone_number: "08012345678",
        starting_price: 5000,
        residential_address: "12 Allen Ave",
        office_address: "12 Allen Ave",
      });
      await request(app)
        .delete(`/api/v1/admin/user/${doomedId}`)
        .set(bearer(adminToken))
        .expect(200);
      await request(app)
        .get(`/api/v1/admin/user/${doomedId}`)
        .set(bearer(adminToken))
        .expect(404);
      assert.equal(await Profile.findById(profile._id), null);
    });

    it("rejects re-registration of a soft-deleted email within the recovery grace period", async () => {
      const reuseEmail = `grace-period-${stamp}@fixly.test`;
      await register({
        firstName: "Grace",
        lastName: "Period",
        email: reuseEmail,
        password: PASSWORD,
        role: "house_owner",
      }).expect(201);
      const user = await User.findOne({ email: reuseEmail });
      const session = await login(reuseEmail);
      await request(app).delete("/api/v1/users/me")
        .set(bearer(session.body.data.token)).send({ password: PASSWORD }).expect(200);

      // Only authenticated ownership proof may reveal recovery options.
      const conflict = await register({
        firstName: "New",
        lastName: "Owner",
        email: reuseEmail,
        password: PASSWORD,
        previousPassword: PASSWORD,
        role: "house_owner",
      }).expect(409);
      assert.match(conflict.body.message, /recovery grace period/i);
      assert.equal(conflict.body.data.isDeactivated, true);
      assert.ok(conflict.body.data.daysRemaining > 0);
    });

    it("allows re-registration of a soft-deleted email past the recovery grace period", async () => {
      const expiredEmail = `expired-grace-${stamp}@fixly.test`;
      await register({
        firstName: "Expired",
        lastName: "Grace",
        email: expiredEmail,
        password: PASSWORD,
        role: "house_owner",
      }).expect(201);
      const user = await User.findOne({ email: expiredEmail });
      // Soft-delete and backdate deletedAt to 35 days ago (past the default 30-day grace period)
      const pastDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      await User.updateOne({ _id: user._id }, { isDeleted: true, deletedAt: pastDate, deletionReason: "self" });

      // Registration now succeeds by purging the old abandoned record
      const res = await register({
        firstName: "Reborn",
        lastName: "User",
        email: expiredEmail,
        password: PASSWORD,
        previousPassword: PASSWORD,
        role: "house_owner",
      }).expect(201);
      assert.equal(res.body.data.email, expiredEmail);
      assert.equal(res.body.data.firstName, "Reborn");
      // The new user has a different _id
      assert.notEqual(res.body.data.id, user._id.toString());
    });
  });

  describe("uploads", () => {
    const cloudinaryKeys = [
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ];

    it("requires authentication", async () => {
      await request(app)
        .post("/api/v1/uploads/image")
        .field("any", "field")
        .expect(401);
    });

    it("retires unattached uploads even while Cloudinary is not configured", async () => {
      const token = (await login(`owner-${stamp}@fixly.test`)).body.data.token;
      const saved = Object.fromEntries(
        cloudinaryKeys.map((key) => [key, process.env[key]]),
      );
      cloudinaryKeys.forEach((key) => delete process.env[key]);
      try {
        await request(app)
          .post("/api/v1/uploads/image")
          .set(bearer(token))
          .attach("image", Buffer.from("not a real image"), "test.jpg")
          .expect(410)
          .expect((r) =>
            assert.match(r.body.message, /PUT \/api\/v1\/users\/me\/avatar/),
          );
      } finally {
        cloudinaryKeys.forEach((key) => {
          if (saved[key]) process.env[key] = saved[key];
        });
      }
    });
  });
});
