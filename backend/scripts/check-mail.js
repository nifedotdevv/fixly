// Checks credential-mail settings and SMTP login; optionally sends one test message.
// Usage: npm run mail:check [-- --to you@example.com]
import "dotenv/config";
import nodemailer from "nodemailer";
import { parseArgs, validateSettings, describeSettings } from "./mailCheckLib.js";

const { to, error: argError } = parseArgs(process.argv.slice(2));
if (argError) {
  console.error(argError);
  process.exit(2);
}
const { settings, error: settingsError } = validateSettings();
if (settingsError) {
  console.error(settingsError);
  process.exit(1);
}
console.log(describeSettings(settings));
const client = nodemailer.createTransport(settings.transport);
try {
  await client.verify();
  console.log("SMTP login OK");
  if (to) {
    const result = await client.sendMail({ from: settings.from, to, subject: "Fixly mail check",
      text: "This is a Fixly SMTP configuration test. No action is needed." });
    if (!result.accepted?.length) throw new Error("recipient rejected");
    console.log(`Test message accepted for ${to}`);
  }
} catch (error) {
  console.error(`SMTP check failed: ${error.code || ""} ${error.message}`.trim());
  process.exitCode = 1;
} finally {
  client.close();
}
