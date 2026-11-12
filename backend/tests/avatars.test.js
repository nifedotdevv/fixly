import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { Writable } from "node:stream";
import { createTestDatabaseName, cleanupTestDatabase } from "./helpers/database.js";

dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "fixly-avatar-test-secret";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.API_RATE_LIMIT_MAX = "1000";
process.env.CLOUDINARY_CLOUD_NAME = "avatar-test-cloud";
process.env.CLOUDINARY_API_KEY = "avatar-test-key";
process.env.CLOUDINARY_API_SECRET = "avatar-test-secret";

const { default: User } = await import("../src/models/users.js");
const { default: Profile } = await import("../src/models/artisanProfile.js");
const { default: cloudinary } = await import("../src/config/cloudinary.js");
const { cleanupAvatarImages, discardAvatarUpload } = await import("../src/services/avatarImages.js");
const { default: app } = await import("../src/index.js");
const { generateToken } = await import("../src/utils/jwt.js");

const databaseName = createTestDatabaseName();
after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await cleanupTestDatabase(mongoose.connection, databaseName);
  }
});
await mongoose.connect(process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017", {
  dbName: databaseName,
  serverSelectionTimeoutMS: 5000,
});
await Promise.all([User.init(), Profile.init()]);
const password = await bcrypt.hash("StrongPass123", 4);

const createUser = (fields = {}) => User.create({
  firstName: "Avatar",
  lastName: "Tester",
  email: `${randomUUID()}@fixly.test`,
  password,
  role: "house_owner",
  ...fields,
});

const avatar = (id) => ({
  url: `https://res.cloudinary.com/avatar-test-cloud/image/upload/${id}.webp`,
  publicId: id,
});

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
const auth = (user) => ({ Authorization: `Bearer ${generateToken(user)}` });
const putImage = (user) => request(app)
  .put("/api/v1/users/me/avatar")
  .set(auth(user))
  .attach("image", image, "avatar.png");

const mockCloudinary = (t, { beforeComplete, uploadError } = {}) => {
  const uploaded = [];
  const destroyed = [];
  t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => {
    let bytes = 0;
    return new Writable({
      write(chunk, encoding, next) { bytes += chunk.length; next(); },
      final(done) {
        const publicId = `${options.folder}/${options.public_id}`;
        uploaded.push({ publicId, options });
        Promise.resolve().then(() => beforeComplete?.(publicId)).then(() => {
          callback(uploadError || null, {
            public_id: publicId,
            secure_url: avatar(publicId).url,
            bytes,
          });
          done();
        }, (error) => { callback(error); done(); });
      },
    });
  });
  const destroy = t.mock.method(cloudinary.uploader, "destroy", async (publicId) => {
    destroyed.push(publicId);
    return { result: "ok" };
  });
  return { uploaded, destroyed, destroy };
};

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const createProfile = (user) => Profile.create({
  user_id: user._id,
  professional_headline: "Artisan with a profile picture",
  profession: "Plumber",
  experience_years: 3,
  phone_number: "08012345678",
  starting_price: 5000,
  residential_address: "12 Allen Ave",
  office_address: "12 Allen Ave",
});

describe("avatar image storage", () => {
  it("defaults to no avatar and hides provider and cleanup metadata", async () => {
    const user = await createUser();
    assert.equal(user.avatar, null);
    await User.updateOne({ _id: user._id }, {
      avatar: avatar("private-avatar-id"),
      avatarCleanup: ["private-cleanup-id"],
    });
    const publicUser = await User.findById(user._id).select("-password").lean();
    assert.deepEqual(publicUser.avatar, { url: avatar("private-avatar-id").url });
    assert.equal(publicUser.avatarCleanup, undefined);
    assert.equal(publicUser.avatarVersion, undefined);
    const internalUser = await User.findById(user._id).select("+avatar.publicId +avatarCleanup");
    assert.equal(internalUser.avatar.publicId, "private-avatar-id");
    assert.deepEqual(internalUser.avatarCleanup.toObject(), ["private-cleanup-id"]);
  });

  it("deletes obsolete images, invalidates cached copies, and preserves the current avatar", async (t) => {
    const user = await createUser({
      avatar: avatar("current"),
      avatarCleanup: ["obsolete", "current"],
    });
    const destroy = t.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    assert.equal(await cleanupAvatarImages(user._id), true);
    assert.equal(destroy.mock.callCount(), 1);
    assert.equal(destroy.mock.calls[0].arguments[0], "obsolete");
    assert.equal(destroy.mock.calls[0].arguments[1].invalidate, true);
    const saved = await User.findById(user._id).select("+avatar.publicId +avatarCleanup");
    assert.equal(saved.avatar.publicId, "current");
    assert.deepEqual(saved.avatarCleanup.toObject(), ["current"]);
  });

  it("retains failed cleanup for a later retry", async (t) => {
    const user = await createUser({ avatarCleanup: ["retry-me"] });
    t.mock.method(console, "error", () => {});
    const destroy = t.mock.method(cloudinary.uploader, "destroy", async () => {
      throw new Error("provider unavailable");
    });
    assert.equal(await cleanupAvatarImages(user._id), false);
    assert.deepEqual((await User.findById(user._id).select("+avatarCleanup")).avatarCleanup.toObject(), ["retry-me"]);
    destroy.mock.mockImplementation(async () => ({ result: "not found" }));
    assert.equal(await cleanupAvatarImages(user._id), true);
    assert.deepEqual((await User.findById(user._id).select("+avatarCleanup")).avatarCleanup.toObject(), []);
  });

  it("removes a newly uploaded image that could not be attached to the account", async (t) => {
    const user = await createUser({ avatar: avatar("keep-me") });
    const destroy = t.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    assert.equal(await discardAvatarUpload(user._id, "failed-upload"), true);
    assert.equal(destroy.mock.calls[0].arguments[0], "failed-upload");
    assert.equal((await User.findById(user._id).select("+avatar.publicId")).avatar.publicId, "keep-me");
  });

  it("removes unattached uploads even if their user was deleted", async (t) => {
    const destroy = t.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    assert.equal(await discardAvatarUpload(new mongoose.Types.ObjectId(), "orphan-upload"), true);
    assert.equal(destroy.mock.calls[0].arguments[0], "orphan-upload");
  });

  it("keeps cleanup metadata when Cloudinary is unconfigured", async (t) => {
    const user = await createUser({ avatarCleanup: ["later"] });
    const secret = process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_API_SECRET;
    t.after(() => { process.env.CLOUDINARY_API_SECRET = secret; });
    t.mock.method(console, "error", () => {});
    const destroy = t.mock.method(cloudinary.uploader, "destroy", async () => assert.fail("must not call Cloudinary"));
    assert.equal(await cleanupAvatarImages(user._id), false);
    assert.equal(destroy.mock.callCount(), 0);
    assert.deepEqual((await User.findById(user._id).select("+avatarCleanup")).avatarCleanup.toObject(), ["later"]);
  });
});

describe("avatar API", () => {
  it("rejects retired general uploads without calling image storage", async (t) => {
    const storage = mockCloudinary(t);
    const user = await createUser();
    await request(app).post("/api/v1/uploads/image").set(auth(user))
      .attach("image", image, "unused.png").expect(410);
    assert.equal(storage.uploaded.length, 0);
    assert.equal((await User.findById(user._id)).avatar, null);
  });

  it("rejects multipart fields before starting an avatar upload", async (t) => {
    const storage = mockCloudinary(t);
    const user = await createUser();
    await request(app).put("/api/v1/users/me/avatar").set(auth(user))
      .field("unused", "x".repeat(64 * 1024))
      .attach("image", image, "avatar.png").expect(400);
    assert.equal(storage.uploaded.length, 0);
  });

  it("requires authentication before reading, uploading, or deleting", async (t) => {
    const storage = mockCloudinary(t);
    await request(app).get("/api/v1/users/me/avatar").expect(401);
    await request(app).put("/api/v1/users/me/avatar").attach("image", image, "avatar.png").expect(401);
    await request(app).delete("/api/v1/users/me/avatar").expect(401);
    assert.equal(storage.uploaded.length, 0);
    assert.equal(storage.destroyed.length, 0);
  });

  it("adds and replaces an avatar for every user role and exposes only its URL", async (t) => {
    const storage = mockCloudinary(t);
    for (const role of ["house_owner", "artisan", "admin"]) {
      const user = await createUser({ role });
      const before = await request(app).get("/api/v1/users/me/avatar").set(auth(user)).expect(200);
      assert.equal(before.body.data.avatar, null);
      const first = await putImage(user).expect(201);
      assert.deepEqual(first.body.data.avatar, { url: avatar(storage.uploaded.at(-1).publicId).url });
      const previous = storage.uploaded.at(-1).publicId;
      const replaced = await putImage(user).expect(200);
      assert.notEqual(replaced.body.data.avatar.url, first.body.data.avatar.url);
      assert.ok(storage.destroyed.includes(previous));
      const current = await request(app).get("/api/v1/users/me/avatar").set(auth(user)).expect(200);
      assert.deepEqual(current.body.data.avatar, replaced.body.data.avatar);
      const saved = await User.findById(user._id).select("+avatar.publicId +avatarCleanup");
      assert.equal(saved.avatar.publicId, storage.uploaded.at(-1).publicId);
      assert.deepEqual(saved.avatarCleanup.toObject(), []);
    }
    const options = storage.uploaded[0].options;
    assert.equal(options.resource_type, "image");
    assert.deepEqual(options.allowed_formats, ["jpg", "jpeg", "png", "webp"]);
    assert.equal(options.format, "webp");
    assert.equal(options.transformation[0].width, 512);
    assert.equal(options.transformation[0].height, 512);
  });

  it("supports existing accounts with no stored avatar field", async (t) => {
    mockCloudinary(t);
    const user = await createUser();
    await User.collection.updateOne({ _id: user._id }, { $unset: { avatar: "", avatarVersion: "" } });
    await putImage(user).expect(201);
  });

  it("rejects missing images, forged metadata, and unsupported media", async (t) => {
    const storage = mockCloudinary(t);
    const user = await createUser();
    await request(app).put("/api/v1/users/me/avatar").set(auth(user)).send({ avatar: avatar("forged") }).expect(400);
    await request(app).put("/api/v1/users/me/avatar").set(auth(user)).field("url", "https://example.com/forged.png").expect(400);
    await request(app).put("/api/v1/users/me/avatar").set(auth(user)).attach("image", image, "avatar.gif").expect(400);
    assert.equal(storage.uploaded.length, 0);
    assert.equal((await User.findById(user._id)).avatar, null);
  });

  it("returns 503 without uploading when storage is unconfigured", async (t) => {
    const user = await createUser();
    const storage = mockCloudinary(t);
    const secret = process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_API_SECRET;
    t.after(() => { process.env.CLOUDINARY_API_SECRET = secret; });
    await putImage(user).expect(503);
    assert.equal(storage.uploaded.length, 0);
  });

  it("cleans an uploaded file when extra fields or multiple files invalidate the request", async (t) => {
    const user = await createUser();
    const other = await createUser({ avatar: avatar("another-account") });
    const storage = mockCloudinary(t);
    await putImage(user).field("user_id", other.id).expect(400);
    await putImage(user).attach("image", image, "second.png").expect(400);
    assert.deepEqual(storage.destroyed.sort(), storage.uploaded.map((entry) => entry.publicId).sort());
    assert.equal((await User.findById(user._id)).avatar, null);
    assert.equal((await User.findById(other._id).select("+avatar.publicId")).avatar.publicId, "another-account");
  });

  it("rejects files over 5 MB and removes their partial upload", async (t) => {
    const user = await createUser({ avatar: avatar("size-limit-current") });
    const storage = mockCloudinary(t);
    await request(app).put("/api/v1/users/me/avatar").set(auth(user))
      .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), "oversize.png")
      .expect(413);
    assert.equal(storage.uploaded.length, 1);
    assert.deepEqual(storage.destroyed, [storage.uploaded[0].publicId]);
    assert.equal((await User.findById(user._id).select("+avatar.publicId")).avatar.publicId, "size-limit-current");
  });

  it("keeps the saved avatar when Cloudinary rejects an upload", async (t) => {
    const user = await createUser({ avatar: avatar("provider-error-current") });
    const storage = mockCloudinary(t, { uploadError: { http_code: 400, message: "Invalid image content" } });
    const res = await putImage(user).expect(400);
    assert.equal(res.body.message, "Image upload failed");
    assert.equal(storage.destroyed.length, 0);
    assert.equal((await User.findById(user._id).select("+avatar.publicId")).avatar.publicId, "provider-error-current");
  });

  it("reports provider authentication, rate limits, and outages as storage failures without exposing details", async (t) => {
    const user = await createUser({ avatar: avatar("unavailable-storage-current") });
    const error = { http_code: 401, message: "private provider authentication details" };
    const storage = mockCloudinary(t, { uploadError: error });
    for (const status of [401, 403, 408, 420, 429, 499, 500]) {
      error.http_code = status;
      const res = await putImage(user).expect(503);
      assert.equal(res.body.message, "Image storage is unavailable. Please try again later.");
      assert.doesNotMatch(JSON.stringify(res.body), /private provider/);
    }
    assert.equal(storage.destroyed.length, 0);
    assert.equal((await User.findById(user._id).select("+avatar.publicId")).avatar.publicId, "unavailable-storage-current");
  });

  it("discards the new upload and keeps the previous avatar when saving fails", async (t) => {
    const user = await createUser({ avatar: avatar("database-error-current") });
    const storage = mockCloudinary(t);
    t.mock.method(User, "findOneAndUpdate", async () => { throw new Error("simulated database failure"); });
    await putImage(user).expect(500);
    assert.deepEqual(storage.destroyed, [storage.uploaded[0].publicId]);
    assert.equal((await User.findById(user._id).select("+avatar.publicId")).avatar.publicId, "database-error-current");
  });

  it("preserves an installed image if the database write succeeded but its acknowledgement failed", async (t) => {
    const user = await createUser();
    const storage = mockCloudinary(t);
    const update = User.findOneAndUpdate.bind(User);
    t.mock.method(User, "findOneAndUpdate", async (...args) => {
      await update(...args);
      throw new Error("simulated lost acknowledgement");
    });
    await putImage(user).expect(500);
    const saved = await User.findById(user._id).select("+avatar.publicId");
    assert.equal(saved.avatar.publicId, storage.uploaded[0].publicId);
    assert.equal(storage.destroyed.length, 0);
  });

  it("preserves the current image if saving avatar removal fails", async (t) => {
    const user = await createUser({ avatar: avatar("failed-delete-save") });
    const storage = mockCloudinary(t);
    t.mock.method(User, "findOneAndUpdate", async () => { throw new Error("simulated database failure"); });
    await request(app).delete("/api/v1/users/me/avatar").set(auth(user)).expect(500);
    assert.equal(storage.destroyed.length, 0);
    assert.equal((await User.findById(user._id).select("+avatar.publicId")).avatar.publicId, "failed-delete-save");
  });

  it("retains old-image cleanup after a provider failure and retries it on the next change", async (t) => {
    const user = await createUser({ avatar: avatar("cleanup-retry-old") });
    const storage = mockCloudinary(t);
    t.mock.method(console, "error", () => {});
    storage.destroy.mock.mockImplementation(async () => { throw new Error("provider down"); });
    const first = await putImage(user).expect(200);
    const saved = await User.findById(user._id).select("+avatarCleanup");
    assert.equal(saved.avatar.url, first.body.data.avatar.url);
    assert.deepEqual(saved.avatarCleanup.toObject(), ["cleanup-retry-old"]);
    storage.destroy.mock.mockImplementation(async () => ({ result: "ok" }));
    await putImage(user).expect(200);
    assert.deepEqual((await User.findById(user._id).select("+avatarCleanup")).avatarCleanup.toObject(), []);
  });

  it("removes only the caller avatar and allows repeated deletion", async (t) => {
    const user = await createUser({ avatar: avatar("remove-own") });
    const other = await createUser({ avatar: avatar("leave-other") });
    const storage = mockCloudinary(t);
    const res = await request(app).delete("/api/v1/users/me/avatar").set(auth(user))
      .send({ user_id: other.id, publicId: "leave-other" }).expect(200);
    assert.equal(res.body.data.avatar, null);
    await request(app).delete("/api/v1/users/me/avatar").set(auth(user)).expect(200);
    assert.deepEqual(storage.destroyed, ["remove-own"]);
    assert.equal((await User.findById(other._id).select("+avatar.publicId")).avatar.publicId, "leave-other");
  });

  it("retains deletion cleanup for retry when Cloudinary is unavailable", async (t) => {
    const user = await createUser({ avatar: avatar("delete-retry") });
    const storage = mockCloudinary(t);
    t.mock.method(console, "error", () => {});
    storage.destroy.mock.mockImplementation(async () => { throw new Error("provider down"); });
    await request(app).delete("/api/v1/users/me/avatar").set(auth(user)).expect(503);
    const saved = await User.findById(user._id).select("+avatarCleanup");
    assert.equal(saved.avatar, null);
    assert.deepEqual(saved.avatarCleanup.toObject(), ["delete-retry"]);
    storage.destroy.mock.mockImplementation(async () => ({ result: "not found" }));
    await request(app).delete("/api/v1/users/me/avatar").set(auth(user)).expect(200);
    assert.deepEqual((await User.findById(user._id).select("+avatarCleanup")).avatarCleanup.toObject(), []);
  });

  it("rejects stale concurrent uploads and removes only the losing image", { timeout: 5000 }, async (t) => {
    const user = await createUser();
    const ready = deferred();
    let arrivals = 0;
    const storage = mockCloudinary(t, { beforeComplete: async () => {
      if (++arrivals === 2) ready.resolve();
      await ready.promise;
    } });
    const results = await Promise.all([putImage(user), putImage(user)]);
    assert.deepEqual(results.map((res) => res.status).sort(), [201, 409]);
    const saved = await User.findById(user._id).select("+avatar.publicId");
    assert.equal(storage.destroyed.length, 1);
    assert.notEqual(storage.destroyed[0], saved.avatar.publicId);
  });

  it("does not resurrect an avatar removed while a replacement is uploading", { timeout: 5000 }, async (t) => {
    const user = await createUser({ avatar: avatar("concurrent-delete") });
    const started = deferred();
    const release = deferred();
    const storage = mockCloudinary(t, { beforeComplete: async () => {
      started.resolve();
      await release.promise;
    } });
    const upload = putImage(user).then((res) => res);
    await started.promise;
    await request(app).delete("/api/v1/users/me/avatar").set(auth(user)).expect(200);
    release.resolve();
    assert.equal((await upload).status, 409);
    assert.equal((await User.findById(user._id)).avatar, null);
    assert.ok(storage.destroyed.includes("concurrent-delete"));
    assert.ok(storage.destroyed.includes(storage.uploaded[0].publicId));
  });

  it("rejects and discards an upload when the user is deactivated in flight", async (t) => {
    const user = await createUser();
    const storage = mockCloudinary(t, { beforeComplete: async () => {
      await User.updateOne({ _id: user._id }, { isDeleted: true });
    } });
    await putImage(user).expect(409);
    assert.equal((await User.findById(user._id)).avatar, null);
    assert.deepEqual(storage.destroyed, [storage.uploaded[0].publicId]);
    await request(app).get("/api/v1/users/me/avatar").set(auth(user)).expect(401);
  });

  it("cancels an in-flight first upload when the user removes their picture", { timeout: 5000 }, async (t) => {
    const user = await createUser();
    const started = deferred();
    const release = deferred();
    const storage = mockCloudinary(t, { beforeComplete: async () => {
      started.resolve();
      await release.promise;
    } });
    const upload = putImage(user).then((res) => res);
    await started.promise;
    await request(app).delete("/api/v1/users/me/avatar").set(auth(user)).expect(200);
    release.resolve();
    assert.equal((await upload).status, 409);
    assert.equal((await User.findById(user._id)).avatar, null);
    assert.deepEqual(storage.destroyed, [storage.uploaded[0].publicId]);
  });

  it("limits upload attempts per account without blocking another account", async (t) => {
    const user = await createUser();
    const other = await createUser();
    const storage = mockCloudinary(t);
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app).put("/api/v1/users/me/avatar").set(auth(user))
        .attach("image", image, "invalid.gif").expect(400);
    }
    await putImage(user).expect(429);
    await putImage(other).expect(201);
    assert.equal(storage.uploaded.length, 1);
  });
});

describe("avatar responses and account lifecycle", () => {
  it("includes only the avatar URL in login, account updates, and admin responses", async () => {
    const user = await createUser({
      avatar: avatar("response-avatar"),
      avatarCleanup: ["response-cleanup"],
    });
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/v1/auth/login")
      .send({ email: user.email, password: "StrongPass123" }).expect(200);
    assert.deepEqual(login.body.data.avatar, { url: avatar("response-avatar").url });
    const updated = await request(app).patch(`/api/v1/users/${user.id}`)
      .set(auth(user)).send({ firstName: "Updated" }).expect(200);
    assert.deepEqual(updated.body.data.avatar, { url: avatar("response-avatar").url });
    assert.equal(updated.body.data.avatarCleanup, undefined);
    const detail = await request(app).get(`/api/v1/admin/user/${user.id}`)
      .set(auth(admin)).expect(200);
    assert.deepEqual(detail.body.data.avatar, { url: avatar("response-avatar").url });
    const list = await request(app).get("/api/v1/admin/users?limit=100")
      .set(auth(admin)).expect(200);
    const found = list.body.data.find((entry) => entry.id === user.id);
    assert.deepEqual(found.avatar, { url: avatar("response-avatar").url });
    assert.equal(found.avatarCleanup, undefined);
    assert.equal(found.password, undefined);
  });

  it("includes avatar URLs in public artisan profiles without provider metadata", async () => {
    const user = await createUser({ role: "artisan", avatar: avatar("public-artisan-avatar") });
    const profile = await createProfile(user);
    const detail = await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(200);
    assert.deepEqual(detail.body.data.user_id.avatar, { url: avatar("public-artisan-avatar").url });
    assert.equal(detail.body.data.user_id.email, undefined);
    const list = await request(app).get("/api/v1/artisan/profiles?limit=100").expect(200);
    const found = list.body.data.find((entry) => entry.id === profile.id);
    assert.deepEqual(found.user_id.avatar, { url: avatar("public-artisan-avatar").url });
    assert.equal(found.user_id.avatarCleanup, undefined);
    assert.equal(found.user_id.password, undefined);
  });

  it("returns null for artisan avatars that have not been uploaded", async () => {
    const user = await createUser({ role: "artisan" });
    const profile = await createProfile(user);
    const detail = await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(200);
    assert.equal(detail.body.data.user_id.avatar, null);
    const list = await request(app).get("/api/v1/artisan/profiles?limit=100").expect(200);
    assert.equal(list.body.data.find((entry) => entry.id === profile.id).user_id.avatar, null);
  });

  it("does not allow avatar metadata to be changed through ordinary user updates", async () => {
    const user = await createUser({ avatar: avatar("protected-avatar") });
    await request(app).patch(`/api/v1/users/${user.id}`).set(auth(user))
      .send({ avatar: avatar("forged"), avatarCleanup: ["someone-else"] }).expect(400);
    await request(app).patch(`/api/v1/users/${user.id}`).set(auth(user))
      .send({ firstName: "Allowed", avatar: avatar("forged"), avatarCleanup: ["someone-else"] }).expect(200);
    const saved = await User.findById(user._id).select("+avatar.publicId +avatarCleanup");
    assert.equal(saved.avatar.publicId, "protected-avatar");
    assert.deepEqual(saved.avatarCleanup.toObject(), []);
  });

  it("retains the picture through soft deletion and restoration", async (t) => {
    const user = await createUser({ role: "artisan", avatar: avatar("restore-picture") });
    const profile = await createProfile(user);
    const admin = await createUser({ role: "admin" });
    const storage = mockCloudinary(t);
    await request(app).patch(`/api/v1/admin/user/${user.id}/soft-delete`).set(auth(admin)).expect(200);
    await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(404);
    await request(app).put("/api/v1/users/me/avatar").set(auth(user))
      .attach("image", image, "avatar.png").expect(401);
    await request(app).delete("/api/v1/users/me/avatar").set(auth(user)).expect(401);
    assert.equal((await User.findById(user._id).select("+avatar.publicId")).avatar.publicId, "restore-picture");
    assert.equal(storage.destroyed.length, 0);
    await request(app).patch(`/api/v1/admin/user/${user.id}/restore`).set(auth(admin)).expect(200);
    const restored = await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(200);
    assert.deepEqual(restored.body.data.user_id.avatar, { url: avatar("restore-picture").url });
  });

  it("removes current and pending images before permanently deleting an account", async (t) => {
    const user = await createUser({
      role: "artisan",
      avatar: avatar("hard-delete-current"),
      avatarCleanup: ["hard-delete-old"],
    });
    const profile = await createProfile(user);
    const admin = await createUser({ role: "admin" });
    const storage = mockCloudinary(t);
    await request(app).delete(`/api/v1/admin/user/${user.id}`).set(auth(admin)).expect(200);
    assert.deepEqual(storage.destroyed.sort(), ["hard-delete-current", "hard-delete-old"]);
    assert.equal(await User.findById(user._id), null);
    assert.equal(await Profile.findById(profile._id), null);
  });

  it("keeps a deactivated account and its cleanup records when permanent deletion needs a retry", async (t) => {
    const user = await createUser({ role: "artisan", avatar: avatar("hard-delete-retry-avatar") });
    const profile = await createProfile(user);
    const admin = await createUser({ role: "admin" });
    const storage = mockCloudinary(t);
    t.mock.method(console, "error", () => {});
    storage.destroy.mock.mockImplementation(async () => { throw new Error("provider down"); });
    await request(app).delete(`/api/v1/admin/user/${user.id}`).set(auth(admin)).expect(503);
    const saved = await User.findById(user._id).select("+avatarCleanup");
    assert.equal(saved.isDeleted, true);
    assert.equal(saved.avatar, null);
    assert.deepEqual(saved.avatarCleanup.toObject(), ["hard-delete-retry-avatar"]);
    await request(app).get(`/api/v1/artisan/profile/${profile.id}`).expect(404);
    await request(app).post("/api/v1/auth/login")
      .send({ email: user.email, password: "StrongPass123" }).expect(401);
    storage.destroy.mock.mockImplementation(async () => ({ result: "ok" }));
    await request(app).delete(`/api/v1/admin/user/${user.id}`).set(auth(admin)).expect(200);
    assert.equal(await User.findById(user._id), null);
    assert.equal(await Profile.findById(profile._id), null);
  });

  it("in-process avatar cleanup sweep processes queued images for accounts with pending cleanup", async (t) => {
    const user = await createUser({
      role: "house_owner",
      avatarCleanup: ["sweep-orphan-1", "sweep-orphan-2"],
    });
    const storage = mockCloudinary(t);
    const { runAvatarCleanupSweep } = await import("../src/services/avatarCleanupSweep.js");
    const result = await runAvatarCleanupSweep();
    assert.ok(result.processed >= 1);
    assert.ok(result.cleaned >= 1);
    assert.ok(storage.destroyed.includes("sweep-orphan-1"));
    assert.ok(storage.destroyed.includes("sweep-orphan-2"));
    const updated = await User.findById(user._id).select("+avatarCleanup");
    assert.deepEqual(updated.avatarCleanup, []);
  });
});


describe("coordinated avatar cleanup sweeps", () => {
  beforeEach(async () => {
    await User.updateMany({}, { $set: { avatarCleanup: [] } });
  });

  it("claims pending work atomically across simultaneous sweep instances", async (t) => {
    const user = await createUser({ avatarCleanup: ["claim-once"] });
    const entered = deferred();
    const release = deferred();
    let calls = 0;
    t.mock.method(cloudinary.uploader, "destroy", async (id) => {
      assert.equal(id, "claim-once");
      calls++;
      entered.resolve();
      await release.promise;
      return { result: "ok" };
    });
    const { runAvatarCleanupSweep } = await import("../src/services/avatarCleanupSweep.js");
    const pending = runAvatarCleanupSweep();
    try {
      await entered.promise;
      assert.deepEqual(await runAvatarCleanupSweep(), { processed: 0, cleaned: 0 });
    } finally {
      release.resolve();
    }
    assert.deepEqual(await pending, { processed: 1, cleaned: 1 });
    assert.equal(calls, 1);
    const saved = await User.findById(user.id).select("+avatarCleanupClaim +avatarCleanup");
    assert.equal(saved.avatarCleanupClaim, null);
    assert.deepEqual(saved.avatarCleanup, []);
  });

  it("backs off failed users so later batches can make progress", async (t) => {
    const oldBatch = process.env.AVATAR_CLEANUP_BATCH_SIZE;
    process.env.AVATAR_CLEANUP_BATCH_SIZE = "1";
    t.after(() => oldBatch === undefined
      ? delete process.env.AVATAR_CLEANUP_BATCH_SIZE : process.env.AVATAR_CLEANUP_BATCH_SIZE = oldBatch);
    const failed = await createUser({ avatarCleanup: ["provider-failed"] });
    const later = await createUser({ avatarCleanup: ["later-success"] });
    t.mock.method(console, "error", () => {});
    const destroyed = [];
    t.mock.method(cloudinary.uploader, "destroy", async (id) => {
      destroyed.push(id);
      if (id === "provider-failed") throw new Error("temporary failure");
      return { result: "ok" };
    });
    const { runAvatarCleanupSweep } = await import("../src/services/avatarCleanupSweep.js");
    assert.deepEqual(await runAvatarCleanupSweep(), { processed: 1, cleaned: 0 });
    assert.deepEqual(await runAvatarCleanupSweep(), { processed: 1, cleaned: 1 });
    assert.deepEqual(destroyed, ["provider-failed", "later-success"]);
    assert.deepEqual((await User.findById(failed.id).select("+avatarCleanup")).avatarCleanup, ["provider-failed"]);
    assert.deepEqual((await User.findById(later.id).select("+avatarCleanup")).avatarCleanup, []);
  });

  it("reclaims expired cleanup claims while preserving active claims and current avatars", async (t) => {
    await createUser({ avatarCleanup: ["expired-claim"], avatarCleanupClaim: "dead-worker", avatarCleanupClaimUntil: new Date(0) });
    await createUser({ avatarCleanup: ["busy-worker"], avatarCleanupClaim: "live-worker", avatarCleanupClaimUntil: new Date(Date.now() + 60_000) });
    await createUser({ avatar: avatar("current-image"), avatarCleanup: ["current-image", "obsolete-image"] });
    const storage = mockCloudinary(t);
    const { runAvatarCleanupSweep } = await import("../src/services/avatarCleanupSweep.js");
    const result = await runAvatarCleanupSweep();
    assert.equal(result.processed, 2);
    assert.deepEqual(storage.destroyed.sort(), ["expired-claim", "obsolete-image"]);
  });

  it("does no provider work without credentials and disables scheduling during tests", async (t) => {
    await createUser({ avatarCleanup: ["unconfigured-provider"] });
    const secret = process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_API_SECRET;
    t.after(() => { process.env.CLOUDINARY_API_SECRET = secret; });
    const storage = mockCloudinary(t);
    const { runAvatarCleanupSweep, startAvatarCleanupSweep } = await import("../src/services/avatarCleanupSweep.js");
    assert.deepEqual(await runAvatarCleanupSweep(), { processed: 0, cleaned: 0 });
    await startAvatarCleanupSweep().stop();
    assert.equal(storage.destroy.mock.callCount(), 0);
  });

  it("rejects invalid sweep configuration", async (t) => {
    const previous = process.env.AVATAR_CLEANUP_BATCH_SIZE;
    process.env.AVATAR_CLEANUP_BATCH_SIZE = "-1";
    t.after(() => previous === undefined
      ? delete process.env.AVATAR_CLEANUP_BATCH_SIZE : process.env.AVATAR_CLEANUP_BATCH_SIZE = previous);
    const { runAvatarCleanupSweep } = await import("../src/services/avatarCleanupSweep.js");
    await assert.rejects(runAvatarCleanupSweep, /positive integer/);
  });
});
