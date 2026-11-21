# Route B: support, reviews and credentials

These workflows work without a live payment provider. No HTTP endpoint marks a booking paid, transfers funds, issues refunds or calls the payment simulator. Real checkout/webhooks, rescheduling and quote revisions remain deferred.

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

Mutations hold the administrator and both participant account locks, recheck administrator eligibility/session, and retain historical records after account removal. Operator access to these private support routes should be limited to people actually performing support.

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
