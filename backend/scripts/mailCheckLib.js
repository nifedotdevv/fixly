// Pure helpers for scripts/check-mail.js (no I/O, safe to import in tests).
import { mailSettings, actionUrl } from "../src/services/credentialMail.js";

export const maskUser = (value) => (value ? `${value.slice(0, 3)}***` : "(none)");

export const parseArgs = (argv) => {
  const index = argv.indexOf("--to");
  if (index === -1) return { to: undefined };
  const to = argv[index + 1];
  if (!to || !/^[^\s@]+@[^\s@]+$/.test(to)) return { error: "--to requires an email address" };
  return { to };
};

// Returns { settings } or { error }; the error text never echoes any configured value.
export const validateSettings = () => {
  try {
    const settings = mailSettings();
    for (const purpose of ["passwordReset", "emailChange"]) actionUrl(purpose);
    return { settings };
  } catch {
    return { error: "Mail settings invalid: check SMTP_HOST, SMTP_PORT, SMTP_USER/SMTP_PASSWORD (both or neither), MAIL_FROM, PASSWORD_RESET_URL, EMAIL_CHANGE_URL and EMAIL_VERIFY_URL." };
  }
};

// Summary line: host, port, masked username and sender only; the password is never included.
export const describeSettings = ({ transport: { host, port, auth }, from }) =>
  `SMTP ${host}:${port} as ${maskUser(auth?.user)}, from ${from}`;
