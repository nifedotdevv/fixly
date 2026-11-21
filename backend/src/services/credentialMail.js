import nodemailer from "nodemailer";

const unavailable = () => Object.assign(new Error("Account email delivery is unavailable. Please try again later."), { statusCode: 503 });
export const mailSettings = () => {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass, MAIL_FROM: from } = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !from || /[\r\n]/.test(from) || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(user) !== Boolean(pass)) throw unavailable();
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  const insecureLocal = process.env.NODE_ENV !== "production" && local && process.env.SMTP_ALLOW_INSECURE_LOCAL === "true";
  return { from, transport: { host, port, secure: port === 465, requireTLS: !insecureLocal,
    ...(user ? { auth: { user, pass } } : {}), connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true } };
};
const ACTION_URL_ENV = { passwordReset: "PASSWORD_RESET_URL", emailChange: "EMAIL_CHANGE_URL", emailVerification: "EMAIL_VERIFY_URL" };
const COPY = {
  passwordReset: ["Reset your Fixly password", "30 minutes"],
  emailChange: ["Confirm your Fixly email change", "30 minutes"],
  emailVerification: ["Verify your Fixly email address", "24 hours"],
};
export const actionUrl = (purpose) => {
  try {
    const url = new URL(process.env[ACTION_URL_ENV[purpose]]);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:"))
      || url.username || url.password || url.search || url.hash) throw unavailable();
    return url;
  } catch { throw unavailable(); }
};

// Object method is deliberately mockable in tests; production never prints tokens or uses a preview transport.
export const credentialMail = {
  async send({ to, purpose, token }) {
    const { from, transport } = mailSettings();
    const url = actionUrl(purpose);
    url.hash = new URLSearchParams({ token }).toString();
    const [subject, lifetime] = COPY[purpose];
    const client = nodemailer.createTransport(transport);
    try {
      const result = await client.sendMail({ from, to, subject,
        text: `${subject}\n\nOpen this link within ${lifetime}:\n${url.href}\n\nIf you did not request this, ignore this email.` });
      if (!result.accepted?.length) throw unavailable();
    } catch { throw unavailable(); }
    finally { client.close(); }
  },
};
