# Project State & Memory

## Current Goal
Comprehensive code review and architectural hardening of the Fixly backend API (Express + MongoDB).

## Key Decisions & Rationale
- Soft deletion implemented using `isDeleted` and `deletedAt` flags on `User` and `Profile` collections.
- Role-based separation (`house_owner`, `artisan`, `admin`) requires authentication and authorization middleware prior to production exposure.
- Public registration only permits house_owner and artisan; administrators are provisioned by a trusted operator or promoted through existing admin-only routes.
- Standalone MongoDB remains supported. Lifecycle endpoints share a per-account MongoDB lock across API processes; user/profile writes remain non-atomic and repeatable. Public reads independently require an active artisan owner.

## What Is Done
- [x] Initial Express server setup and MongoDB connection
- [x] User registration endpoint (`/api/v1/auth/register`)
- [x] Artisan profile creation, update, and search/listing endpoints
- [x] Admin endpoints for user retrieval and update
- [x] Admin endpoints for user hard deletion, soft deletion, and restoration
- [x] Fixed middleware import paths following relocation to `src/middleware/`
- [x] Password hashing (bcrypt, salt 12) during user registration
- [x] Authentication (JWT) and RBAC authorization middleware for admin and user-specific endpoints
- [x] Sanitized search regex input in artisan profile queries (ReDoS/injection fixed)
- [x] Automated test suite (node:test + supertest, `npm test`, separate test DB)
- [x] Security middleware: helmet, cors (CLIENT_ORIGIN allowlist), express-rate-limit on /api/v1 and stricter on /api/v1/auth
- [x] JWT startup guard (refuses to start without JWT_SECRET), role dropped from token payload
- [x] Soft-deleted profiles/users blocked from update + profile creation (`isDeleted` checks)
- [x] Shared pagination util, shared PROFESSIONS constant, prod-safe error responses
- [x] Upload toolchain installed: multer 2.5 + multer-storage-cloudinary 4 + cloudinary 2.11 (`backend/.npmrc` pins legacy-peer-deps since MSC still declares peer cloudinary ^1; runtime-compatible with v2 — only uses `uploader.upload_stream`/`destroy`)
- [x] Cloudinary avatar uploads with bounded multipart parsing; generic `POST /api/v1/uploads/image` retired with authenticated 410 responses
- [x] Public admin registration rejected; existing admin role management retained
- [x] Profile ownership derived from req.user._id; user_id rejected in creation requests
- [x] Client-supplied ratings rejected on creation and update; new profiles start with []
- [x] Unique test database per run, guarded cleanup, and a dedicated test JWT secret
- [x] Role-independent lifecycle cascades, recovery on retry, and public hiding of inactive or missing owners
- [x] Accounts with profiles retain the artisan role; admin details include deletion metadata and deleted profiles when requested
- [x] Generic login failures without internal messages in responses or sensitive details in logs
- [x] Authenticated GET/PUT/DELETE /api/v1/users/me/avatar for every role, 5MB image limit, per-account upload limits, and 512x512 WEBP conversion
- [x] Private avatar metadata and revision guards, queued cleanup retries, public avatar URLs, and image cleanup on permanent account deletion
- [x] Backend regression suite: 266 passing tests covering account recovery, concurrent creation, avatars, lifecycle/payment boundaries, support resolution, reviews, credential recovery and effective status filtering
- [x] Patched body-parser to 2.4.0; bounded password bytes for new accounts and validated list queries
- [x] GET /api/v1/users/me and GET /api/v1/artisan/profile/me preserve separate account/professional views
- [x] Shared MongoDB lifecycle coordinator rejects concurrent delete/soft-delete/restore operations with 409
- [x] Durable lifecycle intent, profile-before-user permanent deletion, bounded automatic repair, and exact-token operator recovery tooling
- [x] Background avatar cleanup with atomic claims, retry scheduling, non-overlapping passes, and graceful shutdown
- [x] Password-confirmed self deletion/reactivation and credential-verified fresh registration after a configurable recovery window; admin restrictions retained
- [x] Session revocation on self/admin soft deletion; old JWTs remain invalid after restore

- [x] Real-process HTTP scenario harness with isolated databases, real API actor setup, guarded payment simulation, reports, and cleanup safety checks
- [x] Fast and timed API tiers: 29 combined scenarios exercise booking journeys, cross-process scheduling and payment events; coverage expanded to all 16 service-request routes with completed-job review submission
- [x] Optional default-timing API journey and a GitHub Actions workflow for regressions, HTTP scenarios, and redacted reports

- [x] Route B domain workflows: admin problem/reconciliation resolution, immutable completed-job reviews and computed rating summaries, effective request-status filtering, and SMTP-backed credential recovery/update endpoints. See [backend/DOMAIN_WORKFLOWS.md](backend/DOMAIN_WORKFLOWS.md).

- [x] Route C frontend built on branch `frontend/route-c` (`frontend/`, React 19, Vite, Tailwind v4, React Query; 235 passing tests): landing, auth and credential recovery pages, account settings, artisan directory/detail/workspace, homeowner and artisan request lifecycle with the tape and payment-waiting panel, and the admin user console and support queues. Known gaps: no online payment, admin user detail cannot show the deactivation reason (API hides `deletionReason`), no search in admin users. See [frontend/README.md](frontend/README.md).

## What Is Next
- [ ] Configure Mailtrap SMTP credentials and verify real reset/email-change delivery; automated tests mock transport
- [ ] Live payment checkout and signed webhooks remain deferred; rescheduling/quote revisions need a separate versioning and reservation contract
- [x] Legacy data audit tooling (`npm run data:audit`, dry-run default; `--apply ratings`); running it against the real database remains an operator step
- [x] Backend last-admin guard (409 `LAST_ADMIN`), `POST /auth/logout-all`, 12h default JWT lifetime, legacy `rating` array hidden from profile responses
- [ ] Adopt a replica set and transactions if atomic lifecycle changes become required
- [ ] Configure valid Cloudinary credentials and verify a real upload; avatar tests currently mock provider calls
- [x] Frontend confirmation dialogs for destructive admin actions; backend last-admin guard is in place
- [ ] Send legacy bcrypt accounts the reset mail (`npm run data:audit -- --apply send-resets`, operator step); inventory historical untracked images
- [ ] Contact/hiring workflows beyond the in-app request flow (no messaging; live payment still deferred)

## Known Gotchas & Constraints
- Profile creation clients must omit user_id and rating; either field causes a 400 response.
- Cascades remain non-transactional on standalone MongoDB. Durable intent is repaired by the next coordinated operation or bounded background maintenance. Uncertain driver errors/crashed writers retain safe locks until verified operator recovery.
- Email/profile uniqueness remains global. Self-deleted accounts can reactivate within the recovery window or restart afterward using previous-password proof; admin-deactivated and legacy accounts require admin handling.
- Queued avatar cleanup is retried by a bounded background sweep as well as user actions. If both database persistence and cleanup cannot complete, the uploaded public ID is logged for manual recovery.
- Avatar DELETE can return 503 with avatar already null when provider cleanup is pending; repeat the request to finish cleanup.

- Lifecycle locks do not expire automatically. A crashed operation or uncertain database write requires operator recovery after confirming the owning process has stopped. See [backend/ACCOUNT_LIFECYCLE.md](backend/ACCOUNT_LIFECYCLE.md).
- Keep personal profile editing separate from professional profile editing; lifecycle actions affect both records.
