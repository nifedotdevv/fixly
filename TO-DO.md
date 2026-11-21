# Fixly To-Do

## Completed (Route A — Backend Stabilization, Testing & Hardening)
- [x] Use Multer and Cloudinary for account avatar uploads (`/api/v1/users/me/avatar`)
- [x] Fix non-lifecycle lock short-circuiting and soft-deleted user `PATCH /api/v1/users/:id` bypass
- [x] Add isolated real-HTTP scenario harness (`npm run test:api*`), bounded `npm test` concurrency, and GitHub Actions CI
- [x] Add local-target guard to `simulate-request-payment.js` and schedule `expireServiceRequests` sweep
- [x] Reconcile `README.md`, `STATE.md`, `backend/ENDPOINT_AUDIT.md`, and `backend/SERVICE_REQUESTS.md`

## Next Phase — Route B: Close Remaining Backend Domain Loops
- [x] Add admin/support resolution workflows for `problem_reported` bookings and `reconciliation_required` payment events
- [ ] Integrate a live payment provider (checkout initiation + signed webhook handler) feeding `applyVerifiedPayment()`
- [x] Add homeowner rating and review submission for `completed` service requests and compute artisan rating aggregates
- [x] Implement forgot-password/reset and verified self-service email/password update flows (including legacy bcrypt recovery)
- [x] Add effective `status` filtering on `GET /api/v1/service-requests`
- [x] Configure SMTP (Gmail) and verify real reset/email-change delivery (`npm run mail:check -- --to <addr>` confirmed 2026-11-21; automated tests still mock mail)
- [ ] Rescheduling / quote revisions deferred: define reservation, consent and payment invalidation/versioning rules first

Route B contracts and Mailtrap setup: [backend/DOMAIN_WORKFLOWS.md](backend/DOMAIN_WORKFLOWS.md). Live payment integration remains deferred.

## Next Phase — Route C: Build the React Frontend (`frontend/`)
- [ ] Set up `react-router-dom`, Vite `/api` proxy, API client (`Authorization: Bearer` + `401` handling), Auth Context (`GET /api/v1/users/me`), and role guards
- [ ] Build Auth & Account Settings pages (register, login, 30-day self-reactivation, avatar upload/removal with `frontend/public/avatars/` fallbacks, self-deletion)
- [ ] Build Public Artisan Directory (`GET /api/v1/artisan/profiles`), Artisan Detail page, and Artisan Profile workspace (`GET/POST/PATCH /api/v1/artisan/profile*`)
- [ ] Build Homeowner & Artisan Service Request dashboard driving the 16-endpoint booking/quote/repair/review lifecycle
- [ ] Build Admin Console (`/api/v1/admin`) with explicit confirmation dialogs for destructive actions (`soft-delete`, `delete`, role changes)
