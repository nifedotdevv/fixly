import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { maskUser, parseArgs, validateSettings, describeSettings } from "../scripts/mailCheckLib.js";

const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM", "PASSWORD_RESET_URL", "EMAIL_CHANGE_URL", "NODE_ENV"];
let saved;
beforeEach(() => { saved = Object.fromEntries(keys.map((k) => [k, process.env[k]])); });
afterEach(() => { for (const k of keys) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]); });
const configure = () => Object.assign(process.env, {
  SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "alice-user", SMTP_PASSWORD: "sentinel-pass-123",
  MAIL_FROM: "Fixly <no-reply@example.test>", PASSWORD_RESET_URL: "https://app.example.test/reset",
  EMAIL_CHANGE_URL: "https://app.example.test/confirm",
});

describe("mail check helpers", () => {
  it("masks usernames to three characters", () => {
    assert.equal(maskUser("alice-user"), "ali***");
    assert.equal(maskUser("ab"), "ab***");
    assert.equal(maskUser(undefined), "(none)");
  });

  it("validates --to", () => {
    assert.deepEqual(parseArgs([]), { to: undefined });
    assert.deepEqual(parseArgs(["--to", "a@b.test"]), { to: "a@b.test" });
    assert.ok(parseArgs(["--to"]).error);
    assert.ok(parseArgs(["--to", "not-an-address"]).error);
  });

  it("accepts valid settings and never prints the password or full username", () => {
    configure();
    const { settings, error } = validateSettings();
    assert.equal(error, undefined);
    const line = describeSettings(settings);
    assert.equal(line, "SMTP smtp.example.test:587 as ali***, from Fixly <no-reply@example.test>");
    assert.equal(line.includes("sentinel-pass-123"), false);
    assert.equal(line.includes("alice-user"), false);
  });

  it("rejects invalid settings with a generic message that echoes no values", () => {
    configure();
    delete process.env.SMTP_PASSWORD;
    const { settings, error } = validateSettings();
    assert.equal(settings, undefined);
    assert.match(error, /^Mail settings invalid/);
    assert.equal(error.includes("alice-user"), false);
    configure();
    process.env.PASSWORD_RESET_URL = "http://insecure.example.test/reset";
    assert.ok(validateSettings().error);
  });
});
