import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-lifecycle-test-secret";
process.env.API_RATE_LIMIT_MAX = "1000";
const { default: app } = await import("../src/index.js");
const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: Lock } = await import("../src/models/accountLifecycleLock.js");
const { generateToken } = await import("../src/utils/jwt.js");
const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await cleanupTestDatabase(mongoose.connection, databaseName);
  }
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName, serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init(), Lock.init()]);
const password = await bcrypt.hash("StrongPass123", 4);
const createUser = (fields = {}) => User.create({
  firstName: "Test", lastName: "Account", email: `${randomUUID()}@fixly.test`, password, ...fields,
});
const admin = await createUser({ role: "admin" });
const auth = (user) => ({ Authorization: `Bearer ${generateToken(user)}` });
const createArtisan = async (isDeleted = false) => {
  const user = await createUser({ role: "artisan", isDeleted });
  const profile = await Profile.create({
    user_id: user._id, professional_headline: "An experienced plumber", profession: "Plumber",
    experience_years: 4, phone_number: "08012345678", starting_price: 5000,
    residential_address: "Private home address", office_address: "Private office address", isDeleted,
  });
  return { user, profile };
};
const actionRequest = (action, id) => action === "delete"
  ? request(app).delete(`/api/v1/admin/user/${id}`).set(auth(admin))
  : request(app).patch(`/api/v1/admin/user/${id}/${action}`).set(auth(admin));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const profileFields = {
  professional_headline: "An experienced plumber", profession: "Plumber",
  experience_years: 4, phone_number: "08012345678", starting_price: 5000,
  residential_address: "Private home address", office_address: "Private office address",
};
const profileRequest = (user) => request(app).post("/api/v1/artisan/profile")
  .set(auth(user)).send(profileFields);
const roleRequest = (user, role, extra = {}) => request(app).patch(`/api/v1/admin/user/${user.id}`)
  .set(auth(admin)).send({ role, ...extra });

describe("profile creation and account changes", { timeout: 10000 }, () => {
  it("blocks deletion, restoration, role changes, and duplicate creation while a profile is inserting", async (t) => {
    const user = await createUser({ role: "artisan" });
    const entered = deferred();
    const release = deferred();
    const original = Profile.create.bind(Profile);
    t.mock.method(Profile, "create", async (...args) => {
      if (args[0].user_id.toString() === user.id) {
        entered.resolve();
        await release.promise;
      }
      return original(...args);
    });
    const pending = profileRequest(user).then((res) => res);
    try {
      await entered.promise;
      assert.equal((await Lock.findById(user.id)).action, "create-profile");
      for (const action of ["delete", "soft-delete", "restore"]) {
        const conflict = await actionRequest(action, user.id).expect(409);
        assert.match(conflict.body.message, /in progress/);
      }
      for (const role of ["house_owner", "admin"]) {
        const conflict = await roleRequest(user, role, { firstName: "Must not change" }).expect(409);
        assert.match(conflict.body.message, /in progress/);
      }
      await profileRequest(user).expect(409);
      const saved = await User.findById(user.id);
      assert.equal(saved.role, "artisan");
      assert.equal(saved.firstName, user.firstName);
      assert.equal(saved.isDeleted, false);
      const other = await createUser({ role: "artisan" });
      await profileRequest(other).expect(201);
      assert.equal(await Lock.findById(other.id), null);
    } finally {
      release.resolve();
      assert.equal((await pending).status, 201);
    }
    assert.equal(await Lock.findById(user.id), null);
    assert.equal(await Profile.countDocuments({ user_id: user.id }), 1);
    assert.equal((await Profile.findOne({ user_id: user.id })).isDeleted, false);
    await profileRequest(user).expect(409);
    assert.equal(await Lock.findById(user.id), null);
    await roleRequest(user, "house_owner").expect(409);
    assert.equal(await Lock.findById(user.id), null);
    await actionRequest("delete", user.id).expect(200);
    assert.equal(await User.findById(user.id), null);
    assert.equal(await Profile.findOne({ user_id: user.id }), null);
  });

  for (const action of ["delete", "soft-delete", "restore"]) {
    it(`blocks profile creation and role changes while ${action} owns the account`, async (t) => {
      const user = await createUser({ role: "artisan" });
      const entered = deferred();
      const release = deferred();
      const original = Lock.create.bind(Lock);
      t.mock.method(Lock, "create", async (...args) => {
        const lock = await original(...args);
        if (args[0]._id.toString() === user.id && args[0].action === action) {
          entered.resolve();
          await release.promise;
        }
        return lock;
      });
      const pending = actionRequest(action, user.id).then((res) => res);
      try {
        await entered.promise;
        await profileRequest(user).expect(409);
        await roleRequest(user, "house_owner").expect(409);
        assert.equal(await Profile.findOne({ user_id: user.id }), null);
        assert.equal((await User.findById(user.id)).role, "artisan");
      } finally {
        release.resolve();
        assert.equal((await pending).status, 200);
      }
      assert.equal(await Lock.findById(user.id), null);
      if (action === "restore") {
        await profileRequest(user).expect(201);
        assert.equal((await Profile.findOne({ user_id: user.id })).isDeleted, false);
      } else {
        await profileRequest(user).expect(401);
        assert.equal(await Profile.findOne({ user_id: user.id }), null);
        if (action === "delete") assert.equal(await User.findById(user.id), null);
        else assert.equal((await User.findById(user.id)).isDeleted, true);
      }
    });
  }

  for (const role of ["house_owner", "admin"]) {
    it(`blocks creation after a pending ${role} role change has checked for profiles`, async (t) => {
      const user = await createUser({ role: "artisan" });
      const entered = deferred();
      const release = deferred();
      const original = User.findOneAndUpdate.bind(User);
      t.mock.method(User, "findOneAndUpdate", (...args) => {
        const query = original(...args);
        if (args[0]._id.toString() === user.id && args[1].role === role) {
          const exec = query.exec.bind(query);
          query.exec = async (...execArgs) => {
            entered.resolve();
            await release.promise;
            return exec(...execArgs);
          };
        }
        return query;
      });
      const pending = roleRequest(user, role).then((res) => res);
      try {
        await entered.promise;
        assert.equal((await Lock.findById(user.id)).action, "update-role");
        await profileRequest(user).expect(409);
        for (const action of ["delete", "soft-delete", "restore"]) {
          await actionRequest(action, user.id).expect(409);
        }
      } finally {
        release.resolve();
        assert.equal((await pending).status, 200);
      }
      assert.equal(await Lock.findById(user.id), null);
      assert.equal((await User.findById(user.id)).role, role);
      assert.equal(await Profile.findOne({ user_id: user.id }), null);
      await profileRequest(user).expect(403);
    });
  }

  for (const action of ["delete", "soft-delete", "role-change"]) {
    it(`rechecks the account when ${action} completes after profile-request authentication`, async (t) => {
      const user = await createUser({ role: "artisan" });
      const entered = deferred();
      const release = deferred();
      let paused = false;
      const original = User.findById.bind(User);
      t.mock.method(User, "findById", (...args) => {
        const query = original(...args);
        if (!paused && args[0].toString() === user.id) {
          paused = true;
          const exec = query.exec.bind(query);
          query.exec = async (...execArgs) => {
            const authenticatedUser = await exec(...execArgs);
            entered.resolve();
            await release.promise;
            return authenticatedUser;
          };
        }
        return query;
      });
      const pending = profileRequest(user).then((res) => res);
      try {
        await entered.promise;
        if (action === "role-change") await roleRequest(user, "house_owner").expect(200);
        else await actionRequest(action, user.id).expect(200);
      } finally {
        release.resolve();
      }
      assert.equal((await pending).status, action === "role-change" ? 403 : 404);
      assert.equal(await Profile.findOne({ user_id: user.id }), null);
      assert.equal(await Lock.findById(user.id), null);
    });
  }

  it("releases the creation lock after an application failure and permits retry", async (t) => {
    const user = await createUser({ role: "artisan" });
    t.mock.method(console, "error", () => {});
    const fault = t.mock.method(Profile, "create", async () => { throw new Error("insert unavailable"); });
    await profileRequest(user).expect(500);
    fault.mock.restore();
    assert.equal(await Lock.findById(user.id), null);
    assert.equal(await Profile.findOne({ user_id: user.id }), null);
    await profileRequest(user).expect(201);
    assert.equal(await Lock.findById(user.id), null);
  });

  it("releases role locks after validation failure or a missing account", async () => {
    const user = await createUser({ role: "artisan" });
    await roleRequest(user, "invalid-role").expect(400);
    assert.equal(await Lock.findById(user.id), null);
    assert.equal((await User.findById(user.id)).role, "artisan");
    await profileRequest(user).expect(201);
    const missing = { id: new mongoose.Types.ObjectId().toString() };
    await roleRequest(missing, "house_owner").expect(404);
    assert.equal(await Lock.findById(missing.id), null);
  });

  it("retains the creation lock when an insert acknowledgement is lost", async (t) => {
    const user = await createUser({ role: "artisan" });
    t.mock.method(console, "error", () => {});
    const original = Profile.create.bind(Profile);
    const fault = t.mock.method(Profile, "create", async (...args) => {
      await original(...args);
      throw new mongoose.mongo.MongoNetworkError("insert acknowledgement lost");
    });
    await profileRequest(user).expect(500);
    fault.mock.restore();
    const lock = await Lock.findById(user.id);
    assert.equal(lock.action, "create-profile");
    assert.equal(await Profile.countDocuments({ user_id: user.id }), 1);
    await profileRequest(user).expect(409);
    await roleRequest(user, "house_owner").expect(409);
    await actionRequest("delete", user.id).expect(409);
    // The faulting request finished; simulate operator verification and exact-token recovery.
    await Lock.deleteOne({ _id: user.id, token: lock.token });
    await actionRequest("delete", user.id).expect(200);
    assert.equal(await Profile.findOne({ user_id: user.id }), null);
  });

  it("retains the role lock when a role write acknowledgement is lost", async (t) => {
    const user = await createUser({ role: "artisan" });
    t.mock.method(console, "error", () => {});
    const original = User.findOneAndUpdate.bind(User);
    const fault = t.mock.method(User, "findOneAndUpdate", (...args) => {
      const query = original(...args);
      if (args[0]._id.toString() === user.id) {
        const exec = query.exec.bind(query);
        query.exec = async (...execArgs) => {
          await exec(...execArgs);
          throw new mongoose.mongo.MongoNetworkError("role acknowledgement lost");
        };
      }
      return query;
    });
    await roleRequest(user, "artisan").expect(500);
    fault.mock.restore();
    const lock = await Lock.findById(user.id);
    assert.equal(lock.action, "update-role");
    await profileRequest(user).expect(409);
    await roleRequest(user, "house_owner").expect(409);
    await actionRequest("delete", user.id).expect(409);
    await Lock.deleteOne({ _id: user.id, token: lock.token });
    await profileRequest(user).expect(201);
    assert.equal(await Lock.findById(user.id), null);
  });
});

describe("coordinated account lifecycle", () => {
  for (const heldAction of ["soft-delete", "restore", "delete"]) {
    it(`rejects competing lifecycle actions while ${heldAction} is in progress`, { timeout: 10000 }, async (t) => {
      const { user, profile } = await createArtisan(heldAction === "restore");
      const entered = deferred();
      const release = deferred();
      const method = heldAction === "delete" ? "deleteOne" : "updateOne";
      const original = Profile[method].bind(Profile);
      t.mock.method(Profile, method, async (...args) => {
        if (args[0].user_id.toString() === user.id) {
          entered.resolve();
          await release.promise;
        }
        return original(...args);
      });
      const pending = actionRequest(heldAction, user.id).then((response) => response);
      try {
        await entered.promise;
        const userBeforeConflicts = (await User.findById(user._id))?.toObject() ?? null;
        for (const conflict of ["soft-delete", "restore", "delete"]) {
          const res = await actionRequest(conflict, user.id).expect(409);
          assert.match(res.body.message, /in progress/);
        }
        assert.deepEqual((await User.findById(user._id))?.toObject() ?? null, userBeforeConflicts);
        // A different account can proceed while this account is locked.
        const other = await createUser();
        await actionRequest("soft-delete", other.id).expect(200);
      } finally {
        release.resolve();
        const res = await pending;
        assert.equal(res.status, 200);
      }
      assert.equal(await Lock.findById(user._id), null);
      if (heldAction === "delete") {
        assert.equal(await User.findById(user._id), null);
        assert.equal(await Profile.findById(profile._id), null);
      } else {
        const expectedDeleted = heldAction === "soft-delete";
        assert.equal((await User.findById(user._id)).isDeleted, expectedDeleted);
        assert.equal((await Profile.findById(profile._id)).isDeleted, expectedDeleted);
        await actionRequest(expectedDeleted ? "restore" : "soft-delete", user.id).expect(200);
        assert.equal((await User.findById(user._id)).isDeleted, !expectedDeleted);
        assert.equal((await Profile.findById(profile._id)).isDeleted, !expectedDeleted);
      }
    });
  }

  it("releases the account lock after a failed cascade and allows a retry", async (t) => {
    const { user, profile } = await createArtisan();
    const fault = t.mock.method(Profile, "updateOne", async () => { throw new Error("cascade unavailable"); });
    await actionRequest("soft-delete", user.id).expect(500);
    fault.mock.restore();
    assert.equal(await Lock.findById(user._id), null);
    await actionRequest("soft-delete", user.id).expect(200);
    assert.equal((await Profile.findById(profile._id)).isDeleted, true);
  });

  it("honors locks acquired through an independent database connection", async (t) => {
    const { user } = await createArtisan();
    const connection = await mongoose.createConnection(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
      dbName: databaseName, serverSelectionTimeoutMS: 5000,
    }).asPromise();
    t.after(() => connection.close());
    const OtherLock = connection.model("AccountLifecycleLock", Lock.schema);
    const token = randomUUID();
    await OtherLock.create({ _id: user._id, token, action: "restore", host: "another-api", processId: 123, startedAt: new Date(0) });
    for (const action of ["soft-delete", "restore", "delete"]) {
      await actionRequest(action, user.id).expect(409);
    }
    await profileRequest(user).expect(409);
    await roleRequest(user, "house_owner").expect(409);
    assert.equal((await OtherLock.findById(user._id)).token, token);
    await OtherLock.deleteOne({ _id: user._id, token });
    await actionRequest("soft-delete", user.id).expect(200);
  });

  it("leaves no lock behind for invalid or missing accounts", async () => {
    for (const action of ["soft-delete", "restore", "delete"]) {
      await actionRequest(action, "invalid").expect(400);
      const id = new mongoose.Types.ObjectId();
      await actionRequest(action, id).expect(404);
      assert.equal(await Lock.findById(id), null);
    }
  });

  it("retains a lock after release failure until an operator recovers it", async (t) => {
    const { user, profile } = await createArtisan();
    t.mock.method(console, "error", () => {});
    const fault = t.mock.method(Lock, "deleteOne", async () => { throw new Error("lock release unavailable"); });
    await actionRequest("soft-delete", user.id).expect(500);
    fault.mock.restore();
    const lock = await Lock.findById(user._id);
    assert.ok(lock);
    assert.equal((await Profile.findById(profile._id)).isDeleted, true);
    await actionRequest("restore", user.id).expect(409);
    // The preceding request has finished; clearing its exact token is now safe.
    await Lock.deleteOne({ _id: user._id, token: lock.token });
    await actionRequest("restore", user.id).expect(200);
    assert.equal((await User.findById(user._id)).isDeleted, false);
    assert.equal((await Profile.findById(profile._id)).isDeleted, false);
  });

  it("retains exclusivity when a database write outcome is unknown", async (t) => {
    const { user } = await createArtisan();
    t.mock.method(console, "error", () => {});
    const fault = t.mock.method(Profile, "updateOne", async () => {
      throw new mongoose.mongo.MongoNetworkError("write acknowledgement lost");
    });
    await actionRequest("soft-delete", user.id).expect(500);
    fault.mock.restore();
    const lock = await Lock.findById(user._id);
    assert.ok(lock);
    await actionRequest("restore", user.id).expect(409);
    // Simulate operator recovery after proving no old write can still run.
    await Lock.deleteOne({ _id: user._id, token: lock.token });
    await actionRequest("soft-delete", user.id).expect(200);
  });
});

describe("separate personal and professional profile reads", () => {
  it("requires authentication for both self-service reads", async () => {
    await request(app).get("/api/v1/users/me").expect(401);
    await request(app).get("/api/v1/artisan/profile/me").expect(401);
  });

  it("returns personal data only and never exposes internal metadata", async () => {
    const { user, profile } = await createArtisan();
    await User.updateOne({ _id: user._id }, { avatar: { url: "https://example.com/avatar.webp", publicId: "private-provider-id" } });
    const res = await request(app).get("/api/v1/users/me").set(auth(user)).expect(200);
    assert.equal(res.body.data.id, user.id);
    assert.equal(res.body.data.email, user.email);
    assert.deepEqual(res.body.data.avatar, { url: "https://example.com/avatar.webp" });
    for (const field of ["password", "passwordByteLimit", "avatarCleanup", "avatarVersion", "artisanProfile", "phone_number"]) {
      assert.equal(res.body.data[field], undefined);
    }
    const professional = await request(app).get("/api/v1/artisan/profile/me").set(auth(user)).expect(200);
    assert.equal(professional.body.data.id, profile.id);
    assert.equal(professional.body.data.phone_number, profile.phone_number);
    assert.equal(professional.body.data.residential_address, profile.residential_address);
    assert.equal(professional.body.data.office_address, profile.office_address);
    assert.equal(professional.body.data.email, undefined);
    // Even an authenticated owner uses the redacted representation on public reads.
    const publicRead = await request(app).get(`/api/v1/artisan/profile/${profile.id}`).set(auth(user)).expect(200);
    assert.equal(publicRead.body.data.phone_number, undefined);
    assert.equal(publicRead.body.data.residential_address, undefined);
  });

  it("keeps personal and professional edits independent", async () => {
    const { user, profile } = await createArtisan();
    await request(app).patch(`/api/v1/users/${user.id}`).set(auth(user))
      .send({ firstName: "Updated", professional_headline: "Ignored professional change" }).expect(200);
    assert.equal((await Profile.findById(profile._id)).professional_headline, profile.professional_headline);
    await request(app).patch(`/api/v1/artisan/profile/${profile.id}`).set(auth(user))
      .send({ professional_headline: "Updated professional headline", firstName: "Ignored personal change" }).expect(200);
    assert.equal((await User.findById(user._id)).firstName, "Updated");
  });

  it("looks up only the caller's professional profile", async () => {
    const { user, profile } = await createArtisan();
    const other = await createUser({ role: "artisan" });
    await request(app).get(`/api/v1/artisan/profile/me?user_id=${user.id}`).set(auth(other)).expect(404);
    await Profile.updateOne({ _id: profile._id }, { isDeleted: true });
    await request(app).get("/api/v1/artisan/profile/me").set(auth(user)).expect(404);
  });

  it("allows personal reads for every role and restricts professional reads to artisans", async () => {
    for (const role of ["house_owner", "artisan", "admin"]) {
      const user = await createUser({ role });
      await request(app).get("/api/v1/users/me").set(auth(user)).expect(200);
      await request(app).get("/api/v1/artisan/profile/me").set(auth(user)).expect(role === "artisan" ? 404 : 403);
    }
    const user = await createUser({ role: "artisan", isDeleted: true });
    await request(app).get("/api/v1/users/me").set(auth(user)).expect(401);
    await request(app).get("/api/v1/artisan/profile/me").set(auth(user)).expect(401);
  });
});
