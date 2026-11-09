import { it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import cloudinary from "../src/config/cloudinary.js";
import { avatarStorage } from "../src/middleware/upload.js";

const upload = (stream) => new Promise((resolve, reject) => {
  avatarStorage._handleFile({ user: { _id: "storage-test" } }, { stream }, (error, file) => {
    if (error) reject(error);
    else resolve(file);
  });
});

it("waits for Cloudinary confirmation after the upload stream finishes", async (t) => {
  let complete;
  let finish;
  const finished = new Promise((resolve) => { finish = resolve; });
  t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => {
    complete = callback;
    return new Writable({
      write(chunk, encoding, next) { next(); },
      final(done) { done(); finish(); },
    });
  });
  let settled = false;
  const pending = upload(Readable.from(["image"])).then((file) => { settled = true; return file; });
  await finished;
  assert.equal(settled, false);
  complete(null, { secure_url: "https://example.com/avatar.webp", bytes: 5, public_id: "avatar-id" });
  assert.deepEqual(await pending, {
    path: "https://example.com/avatar.webp", size: 5, filename: "avatar-id",
  });
});

it("reports synchronous Cloudinary failures", async (t) => {
  t.mock.method(cloudinary.uploader, "upload_stream", () => { throw new Error("provider failed"); });
  await assert.rejects(upload(Readable.from(["image"])), /provider failed/);
});

it("reports destination stream errors even without a provider callback", async (t) => {
  t.mock.method(cloudinary.uploader, "upload_stream", () => new Writable({
    write(chunk, encoding, next) { next(new Error("upload interrupted")); },
  }));
  await assert.rejects(upload(Readable.from(["image"])), /upload interrupted/);
});

it("destroys the upload stream when the input stream fails", async (t) => {
  const destination = new Writable({ write(chunk, encoding, next) { next(); } });
  t.mock.method(cloudinary.uploader, "upload_stream", () => destination);
  const input = new Readable({ read() { this.destroy(new Error("input interrupted")); } });
  await assert.rejects(upload(input), /input interrupted/);
  assert.equal(destination.destroyed, true);
});
