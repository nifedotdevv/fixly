# Fixly To-Do

## Completed (Route A — Backend Stabilization, Testing & Hardening)
- [x] Use Multer and Cloudinary for account avatar uploads (`/api/v1/users/me/avatar`)
- [x] Fix non-lifecycle lock short-circuiting and soft-deleted user `PATCH /api/v1/users/:id` bypass
- [x] Add isolated real-HTTP scenario harness (`npm run test:api*`), bounded `npm test` concurrency, and GitHub Actions CI
- [x] Add local-target guard to `simulate-request-payment.js` and schedule `expireServiceRequests` sweep
- [x] Reconcile `README.md`, `STATE.md`, `backend/ENDPOINT_AUDIT.md`, and `backend/SERVICE_REQUESTS.md`

## Next Phase — Route B: Close Remaining Backend Domain Loops
- [ ] Add admin/support resolution workflows for `problem_reported` bookings and `reconciliation_required` payment events
- [ ] Integrate a live payment provider (checkout initiation + signed webhook handler) feeding `applyVerifiedPayment()`
- [ ] Add homeowner rating and review submission for `completed` service requests and compute artisan rating aggregates
- [ ] Implement forgot-password/reset and self-service email/password update flows (including legacy >72-byte bcrypt accounts)
- [ ] Add `status` filtering on `GET /api/v1/service-requests` (and evaluate rescheduling / quote revision support)

## Next Phase — Route C: Build the React Frontend (`frontend/`)
- [ ] Set up `react-router-dom`, Vite `/api` proxy, API client (`Authorization: Bearer` + `401` handling), Auth Context (`GET /api/v1/users/me`), and role guards
- [ ] Build Auth & Account Settings pages (register, login, 30-day self-reactivation, avatar upload/removal with `frontend/public/avatars/` fallbacks, self-deletion)
- [ ] Build Public Artisan Directory (`GET /api/v1/artisan/profiles`), Artisan Detail page, and Artisan Profile workspace (`GET/POST/PATCH /api/v1/artisan/profile*`)
- [ ] Build Homeowner & Artisan Service Request dashboard driving the 15-endpoint booking/quote/repair lifecycle
- [ ] Build Admin Console (`/api/v1/admin`) with explicit confirmation dialogs for destructive actions (`soft-delete`, `delete`, role changes)
