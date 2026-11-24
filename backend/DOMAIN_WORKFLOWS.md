# Route B: support, reviews and credentials

Online payment goes through Paystack (see [Paystack payments](#paystack-payments)). No other HTTP endpoint marks a booking paid, transfers funds or calls the payment simulator. Payouts to artisans are manual. Rescheduling and quote revisions remain deferred.

## Support

All paths below require an active administrator's Bearer token. Ordinary service-request endpoints remain participant-only; administrators use these separate support routes. Lists use `page`/`limit` pagination.

| Method/path under `/api/v1/admin` | Contract |
| --- | --- |
| `GET /support/requests` | Unresolved `problem_reported` queue. |
| `GET /support/requests/:id` | Full private booking and support audit detail. |
| `POST /support/requests/:id/resolve` | Body: `problemReportedAt` (ISO timestamp copied from the inspected problem), `disposition`, `note`, optional `resolutionReference`. |
| `GET /support/payments` | Unresolved `reconciliation_required` events with external references. |
| `POST /support/payments/resolve` | Body: `paymentReference`, `disposition`, `note`, `resolutionReference`. |

Problem dispositions:

- `resume_confirmation`: returns the booking to `awaiting_homeowner_confirmation`; homeowner confirmation and verified balance are still required.
- `close`: requires a reference documenting external resolution, enters terminal `support_closed` and releases any reserved/confirmed appointments. This administrative closure does not mean completed, paid or refunded. Such bookings cannot receive completed-job reviews.

Notes are required (1–2000 characters); external references are 1–200 characters. Problem history retains the complaint and administrator decision. Timestamp binding prevents an old decision resolving a newer complaint. Identical retries preserve the first decision; conflicting decisions return `409`. Participant reads expose disposition/timestamps but omit administrator identity, private notes and evidence references.

Payment dispositions are `externally_refunded` or `externally_settled`, requiring external evidence and a note. These record an operator's confirmation that the matter was handled outside Fixly; they do not initiate that action. Original `reconciliation_required` outcomes remain immutable, replay never applies them to a booking, and `processing`/`applied` events cannot be resolved here. Resolution removes that event's account-deletion restriction. A separate unresolved booking or receipt still blocks lifecycle changes.

While an automatic refund is `requesting`, `pending` or `processed`, a manual resolution returns `409` (`REFUND_IN_PROGRESS`). One that Paystack `failed` or flagged `needs_attention` stays in the queue for an administrator to handle by hand.

Mutations hold the administrator and both participant account locks, recheck administrator eligibility/session, and retain historical records after account removal. Operator access to these private support routes should be limited to people actually performing support.

## Paystack payments

The server decides what is due and how much; the browser never sends a purpose or an amount. Only Paystack's own verify API decides whether money was taken, and the request and purpose always come from our stored `PaymentAttempt`, never from the browser, a webhook payload or provider metadata. Every successful charge ends as one `PaymentEvent` (`paystack:<reference>`): `applied` to the booking, or `reconciliation_required` and refunded.

| Method/path | Contract |
| --- | --- |
| `POST /api/v1/service-requests/:id/payments` | Homeowner with a verified email. Starts or reuses the checkout for what the request is waiting on. Returns `reference`, `accessCode` (for the Paystack popup), `purpose`, `amount`, `currency`, `paymentDeadline`. |
| `POST /api/v1/service-requests/:id/payments/:reference/verify` | Homeowner. Asks Paystack about the checkout and settles it. Safe to repeat. Returns Paystack's `status`, our `outcome` once settled, and the updated `request`. |
| `POST /api/v1/payments/paystack/webhook` | Paystack only, authenticated by the `x-paystack-signature` HMAC-SHA512 of the raw body. |

Both homeowner routes are limited per user (`PAYMENT_RATE_LIMIT_MAX`, default 20 a minute). Before a new checkout starts, earlier unsettled checkouts for the same payment are checked with Paystack, so a payment whose confirmation was lost is never charged twice.

**Webhook.** The signature is checked over the exact bytes before anything is parsed (bodies up to 64kb, `application/json` only). A missing key answers `503`, a bad signature `401`, an unparseable body `400`. `charge.success` only names which of our references to look at again: the server calls Paystack's verify API and settles from that. `refund.*` events re-read the refund from Paystack the same way. References that are not ours, and other events, get `200` and are ignored. Anything else that fails answers `500` so Paystack retries (up to 72 hours in live mode). Replays, retries and a webhook racing the popup confirmation all settle once.

**Payments that cannot count** (paid after the deadline, a second payment for the same thing, a different amount, or a participant who is no longer eligible) are recorded as `reconciliation_required` and refunded in full automatically. Paystack's fee on them is not returned. Refund states:

| `refund.state` | Meaning |
| --- | --- |
| `requesting` | Claimed and sent; Paystack's answer was unclear. The sweep asks Paystack whether a refund exists before trying again, at most 3 tries. |
| `pending` | Paystack accepted the refund. |
| `processed` | Paystack's record says it was refunded. The event is resolved automatically (`externally_refunded`, `automatic: true`) and stops blocking the accounts. |
| `failed` | Paystack refused, and holds no refund for the payment. Left for an administrator. |
| `needs_attention` | Paystack flagged it, refunded a different amount, or never confirmed. Left for an administrator. |

Only one caller can claim a refund (an atomic update that also requires no resolution), so a payment is never refunded twice, and never both refunded automatically and resolved by hand.

**Sweep.** Every `PAYMENT_SWEEP_INTERVAL_MS` (default 5 minutes), when a key is set, a bounded pass (25 of each kind):
1. Checks unsettled checkouts from the last 72 hours (older than 2 minutes) with Paystack, least recently checked first, and settles any that were paid.
2. Starts refunds that were never started.
3. Recovers refunds left `requesting` for 10 minutes, and re-reads `pending` refunds not checked for an hour.

**Setup.** Put the test secret key in `PAYSTACK_SECRET_KEY` (a live key is refused unless `NODE_ENV=production`). In the Paystack dashboard set the webhook URL to `https://<public host>/api/v1/payments/paystack/webhook`; locally that needs a tunnel.

## Reviews and rating summaries

`POST /api/v1/service-requests/:id/review` requires the original homeowner's active authenticated session and a `completed` booking. Body:

```json
{ "rating": 5, "comment": "Careful work and a tidy finish." }
```

`rating` is a JSON integer from 1 to 5; `comment` is optional, at most 2000 characters. Unknown fields are rejected. The first submission returns `201` and the participant booking view includes `review`. There is one immutable review per booking; duplicate/concurrent submissions return `409`. Other participants cannot submit on behalf of the homeowner, and unrelated accounts receive `404`.

Public directory/detail and the artisan's own professional profile include `ratingSummary: { count, average }`. With no reviews this is `{ "count": 0, "average": null }`. Summaries are computed from reviews embedded atomically in completed bookings, excluding historical `Profile.rating` arrays. The legacy array remains for compatibility and still rejects client edits. Review text, homeowner IDs and private booking data are not exposed through directory aggregates. Review history survives account deletion; deactivated artisans remain hidden from the public directory.

`GET /api/v1/service-requests?status=completed&page=1&limit=20` filters before counting/pagination. Supply one exact status from `REQUEST_STATUS` (including `support_closed`). Empty, repeated or invalid values return `400`. Effective deadline expiry is reflected even before the maintenance sweep persists it.

## Credential endpoints

| Method/path under `/api/v1` | Body / behavior |
| --- | --- |
| `POST /auth/forgot-password` | `{ "email": "owner@example.com" }`; generic `200` for active, unknown or deactivated addresses when mail is configured. |
| `POST /auth/reset-password` | `{ "token": "<64-character hex token>", "password": "NewPassword123" }`; optional matching `confirmPassword`. |
| `PATCH /users/me/password` | Bearer token; `{ "currentPassword": "OldPassword123", "password": "NewPassword123" }`; optional matching `confirmPassword`. |
| `POST /users/me/email-change` | Bearer token; `{ "currentPassword": "CurrentPassword123", "email": "new@example.com" }`; sends a confirmation to the new address without changing the old one. |
| `POST /auth/confirm-email-change` | `{ "token": "<64-character hex token>" }`; changes email only after mailbox proof. Unique-email conflicts return `409`. |

New passwords need 10+ characters, uppercase/lowercase/digit and at most 72 UTF-8 bytes. Successful resets, password changes and confirmed email changes revoke all existing JWT sessions and pending credential links; sign in again afterward. Legacy accounts without the password-byte policy marker retain existing login compatibility but must use email reset before sensitive credential changes, avoiding ambiguous bcrypt truncation proof.

Tokens are random, purpose-bound, stored as hidden SHA-256 hashes, expire after 30 minutes and can be consumed once. Issuing a new token replaces the previous token for that purpose. Token consumption rechecks active account/session state under the shared account lock and guards expiry at the database write. Deleted accounts cannot use links. Token fields are omitted from user JSON, including when explicitly selected internally. No token is returned in an API response or application log.

Credential routes add a shared 10-request/15-minute IP limiter; authenticated changes also limit per account, and forgot-password limits each supplied address to five requests/15 minutes. Existing API/auth limiters also apply. Stores remain per API process, as with existing rate limiting.

## Email verification

- Registration creates the account with `emailVerified: false` and sends a verification mail in the background. A mail or configuration failure never fails registration; the dead token is cleared and the user can resend.
- Token: 32 random bytes, only the SHA-256 hash is stored (`emailVerification`, never serialized), valid for **24 hours** (`EMAIL_VERIFICATION_TOKEN_MINUTES`; reset and email-change links stay at 30 minutes), bound to the account's current address. Link target comes from `EMAIL_VERIFY_URL`; the token is in the URL fragment.
- `POST /api/v1/auth/verify-email {token}`: public, IP rate-limited, single use. Invalid, expired, replayed or stale (address changed) tokens all return the same 400. Sessions stay valid (no `authVersion` change).
- `POST /api/v1/auth/resend-verification`: authenticated, IP and per-account rate limited. Replaces any earlier token. Already verified: 200 no-op. 503 if mail is not configured.
- A confirmed email change marks the new address verified.
- Unverified users can log in (`emailVerified` is returned by register, login and `/users/me`) but `POST /service-requests` returns `403 {code: "EMAIL_NOT_VERIFIED"}`.
- **Grandfathering:** there is no migration and no schema default. A missing `emailVerified` (accounts created before this feature) counts as verified; only an explicit `false` is unverified. All checks use `emailVerified !== false` / `{ $ne: false }`.

## Artisan discovery and booking visibility

- Directory (`GET /artisan/profiles`) and by-id (`GET /artisan/profile/:id`) show only active artisans with a verified email and a non-deleted profile. The by-id route returns 404 for an unverified artisan except to the owner and admins.
- The same rule gates booking: `POST /service-requests` for an artisan who is unverified, soft-deleted (user or profile) or `isAvailable: false` returns `409 {code: "ARTISAN_UNAVAILABLE"}`. Both paths use `src/services/artisanVisibility.js`. Unknown or non-artisan ids keep the existing 400. The directory still lists artisans with `isAvailable: false` (so a client can show them as away); `available=true` narrows to bookable profiles.
- Profile fields added: `skills` (up to 10, 2-40 chars), `city` (up to 60), `serviceAreas` (up to 20, 2-60 chars), `isAvailable` (default true; missing on legacy profiles counts as available). All optional on create and update.
- **Lowercased text:** skills, city and areas are trimmed, whitespace-collapsed and stored in lowercase so filters are exact matches without regex. API responses return them lowercase; the frontend should format them for display.
- Query parameters: `profession`, `skill` (exact skill), `area` (exact city or served area), `available=true|false`, plus existing `search` (headline, profession, skills), `sortBy`, `order`, `page`, `limit` (default 20, max 100). Each must be a single plain string (max 60 chars for skill/area); bracketed or repeated forms such as `skill[$ne]=x` return 400. Values are normalized and compared with equality, never as regex or operators.
- Indexes: `{isDeleted, profession, isAvailable, createdAt}`, `{skills}`, `{serviceAreas}`, `{city}`.

## Participant details in service requests

Request responses (list, get, create and every mutation including reviews) keep `homeowner` and `artisan` as ids and add `participants.homeowner` / `participants.artisan`, each `{id, firstName, lastName, name, avatar: {url} | null}`. The projection is explicit: no email, phone, role or any credential field of the other party. The artisan's phone and addresses are still never exposed here. Names stay visible for deactivated counterparts so history reads correctly; a missing account yields null names.

## Mailtrap development setup

Create an Email Sandbox inbox and copy its SMTP username/password from its Integration tab. The host/port below follow [Mailtrap's SMTP setup](https://docs.mailtrap.io/email-sandbox/setup). Sandbox captures messages in Mailtrap; it does not deliver them to customers.

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-sandbox-username
SMTP_PASSWORD=your-sandbox-password
MAIL_FROM=Fixly <no-reply@fixly.test>
PASSWORD_RESET_URL=http://localhost:5173/reset-password
EMAIL_CHANGE_URL=http://localhost:5173/confirm-email-change
```

Copy these values into `backend/.env`; keep credentials out of Git. SMTP requires TLS (implicit on port 465, STARTTLS otherwise). Production action URLs require HTTPS; development can use HTTP on localhost only. URLs must be configured, without embedded credentials, queries or fragments, and are never derived from request headers. The message adds `#token=...` to the configured URL. A future frontend reads that fragment and submits the token in JSON; the current Vite starter does not implement those pages. To test now, read the token from the Mailtrap message and POST it using an API client.

Missing/invalid mail configuration returns `503` consistently before account lookup. Delivery failures during forgot-password happen after the generic `200` is returned (same as unknown addresses) and invalidate the undelivered token; check provider delivery when troubleshooting. Email-change delivery failures return `503` without changing email. Live delivery still needs actual Mailtrap credentials and a manual round trip. Automated credential tests mock delivery and require no provider secrets.

Forgot-password sends its mail in a detached background task, so SMTP latency no longer separates known from unknown addresses and the response body and status are identical. Send failures are logged by error name only and the undelivered token is invalidated. Small database-timing differences for existing accounts remain, and mail in flight at process exit can be lost; a durable asynchronous mail queue remains a future hardening option.

The generic SMTP adapter can later use a production email provider. Mailbox ownership is proved for reset/email change only; registration still does not verify emails.

### Gmail SMTP alternative

Gmail works with the same adapter and no code changes, but it delivers real mail (send only to inboxes you control) and caps sending at roughly 500 messages per day, so it suits development and demos rather than production. Enable 2-Step Verification on the account, create an App Password (Google Account → Security → App passwords) and use its 16 characters without spaces; the normal account password is rejected. `MAIL_FROM` must use the same Gmail address or Gmail rewrites the sender. New accounts may land in spam.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-address@gmail.com
SMTP_PASSWORD=your-app-password
MAIL_FROM=Fixly <your-address@gmail.com>
```

### Checking the configuration

`npm run mail:check` validates the mail settings and action URLs, then logs in to the SMTP server without sending anything. `npm run mail:check -- --to you@example.com` also sends one plain test message (no token). The script masks the username and never prints the password. Afterwards, confirm the real flow by calling `POST /api/v1/auth/forgot-password` for an account whose inbox you own.

## Legacy data audit

`npm run data:audit` prints a JSON report: admins (id, email, createdAt, isDeleted), profiles with a non-empty legacy `rating` array, and active accounts missing `passwordByteLimit` (legacy hashes, with a sub-count of non-bcrypt hashes). Hashes and tokens are never printed. It is a dry run unless told otherwise, and idempotent.

- `npm run data:audit -- --apply ratings` sets `rating: []` where non-empty and reports matched/modified counts; a rerun reports 0.
- `npm run data:audit -- --apply send-resets [--batch N]` calls `forgotPassword` for active, non-admin legacy accounts, then flushes pending mail. Output has counts only, no addresses. Requires the mail settings.
- Admins have no write path in this script.
- A non-local `MONGODB_URI` is refused unless `--remote --confirm-db <name>` matches the connected database name.

## Sessions and last administrator

- Tokens default to a 12h lifetime (`JWT_EXPIRES_IN`). `POST /api/v1/auth/logout-all` (authenticated) bumps `authVersion` and clears pending reset/email-change tokens, so every earlier token returns 401.
- Demoting, soft-deleting or deleting the last active admin returns 409 `{ "code": "LAST_ADMIN" }`. Active admins serialize on one extra lifecycle lock (taken after the account lock), so two admins cannot remove each other concurrently. `DELETE /users/me` by the last active admin is guarded the same way (after password verification).

## Frontend client contract

- Keep the JWT in memory, mirrored to `sessionStorage` so a reload keeps the session.
- On any 401, clear the token and navigate to `/login`.
- On the legacy-account 409 ("Reset your password using your email address...") show a link to forgot-password.
- The Vite dev proxy forwards `/api` to the backend; use relative `/api/v1/...` URLs.
- Profile responses no longer include `rating`; use `ratingSummary`.
