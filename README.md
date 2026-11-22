# Fixly

Fixly is a project for connecting homeowners with artisans such as plumbers, electricians, carpenters, and painters. It includes an Express API backed by MongoDB and a React frontend.

The backend supports user accounts and artisan profiles. The frontend is currently a Vite starter page, with the application interface still to be built.

## Features

- User registration, login, and self-deleted account reactivation with JWT authentication.
- Roles for homeowners (`house_owner`), artisans, and administrators.
- Artisan profiles with profession, experience, contact details, and starting prices.
- Browsing artisan profiles and updating owned profiles.
- Service request and booking workflows between homeowners and artisans.
- User account updates, profile pictures (avatars), and password-confirmed self-deletion.
- Admin user management, including deletion, soft deletion, and restoration.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB, Mongoose, Joi, JWT, and bcryptjs.
- **Frontend:** React and Vite.

## Project Structure

```text
backend/src/    API routes, controllers, models, middleware, and configuration
frontend/src/  React components, styles, and assets
```

## Getting Started

You need Node.js, npm, and a running MongoDB instance or a MongoDB Atlas connection string.

### Backend

From the project root:

```bash
cd backend
npm install
cp -n .env.example .env
```

Update `backend/.env` with your MongoDB connection string and a long, random JWT secret:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/fixly-backend
JWT_SECRET=replace-with-long-random-secret
JWT_EXPIRES_IN=1d
CLIENT_ORIGIN=http://localhost:5173
```

`CLIENT_ORIGIN` is the comma-separated list of browser origins allowed to call the API (e.g. your Vite dev server). Leave it empty to block cross-origin browser requests.

Start the development server:

```bash
npm run dev
```

The API runs at `http://localhost:5000` by default. Use `npm start` to run it without automatic restarts.

### Security middleware

The API ships with `helmet` (security headers), `cors` (origin gating via `CLIENT_ORIGIN`), and `express-rate-limit` (a general limiter on `/api/v1` plus a stricter one on `/api/v1/auth`; see `AUTH_RATE_LIMIT_MAX` / `API_RATE_LIMIT_MAX` in `.env.example`). The server refuses to start without `JWT_SECRET`.

### Tests

From `backend`:

```bash
npm test
```

The suite (`backend/tests/`) runs with Node's built-in test runner and Supertest. Each integration run creates a unique `fixly-test-<random-id>` database and only drops that database during cleanup. Set `MONGODB_URI_TEST` to select a test server; the database name in that URI is overridden. The default server is `mongodb://127.0.0.1:27017`.

### Frontend

In a separate terminal, from the project root:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build` inside `frontend`.

## API Routes

| Base path | Purpose |
| --- | --- |
| `/api/v1/auth` | Register, log in, and reactivate self-deleted accounts |
| `/api/v1/artisan` | Create, browse, and update artisan profiles |
| `/api/v1/users` | Read, update, or self-delete your user account and manage your avatar |
| `/api/v1/service-requests` | Create and manage homeowner-artisan service requests and bookings (see [backend/SERVICE_REQUESTS.md](backend/SERVICE_REQUESTS.md)) |
| `/api/v1/admin` | Manage users as an administrator |
| `/api/v1/uploads` | Retired general upload endpoint; authenticated requests return 410 |

Protected endpoints require an `Authorization: Bearer <token>` header.

Public registration accepts only `house_owner` and `artisan` roles. An existing administrator can promote a registered account through `PATCH /api/v1/admin/user/:id`; the first administrator must be provisioned by a trusted database operator.

Profile creation uses the authenticated artisan as its owner. Omit `user_id` from the request body; supplying it returns `400`.
Ratings are initialized to an empty array by the server. Supplying `rating` when creating or updating a profile returns `400`.

Accounts with an artisan profile, including a soft-deleted profile, must retain the `artisan` role; changing them to another role returns `409`. Public profile reads require an active artisan owner and an active profile. Admin user details with `includeDeleted=true` include deletion metadata and any soft-deleted profile.

Personal and professional profiles remain separate. `GET /api/v1/users/me` returns the authenticated account's personal data; `PATCH /api/v1/users/:id` updates its names. `GET /api/v1/artisan/profile/me` returns the authenticated artisan's complete professional profile, including their own phone and addresses; `PATCH /api/v1/artisan/profile/:id` updates professional fields only. Public profile reads always omit phone and addresses.

User deletion, soft deletion, and restoration retain their existing URLs and share one coordinator. A MongoDB lock keyed by account id prevents overlapping lifecycle actions across API processes; conflicts return `409`. Different accounts can proceed independently. Standalone MongoDB remains supported. Writes to the user and profile are still non-atomic: ordinary application failures release the lock and a retry finishes synchronization. Database driver errors retain the lock because a write outcome may be unknown. Public reads independently hide profiles of inactive or missing owners.

Locks do not expire automatically. A process crash, database driver error, or unavailable database during lock release can leave a persistent lock that requires operator recovery. See [account lifecycle and recovery](backend/ACCOUNT_LIFECYCLE.md) before clearing one. Administrator self-demotion/deletion policy remains unchanged; frontend confirmation is deferred and does not prevent direct API calls.

### Image uploads

`POST /api/v1/uploads/image` is retired: unauthenticated requests return `401`, authenticated requests return `410`, and no file is uploaded. Use the account avatar endpoint below. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `backend/.env` to enable avatar uploads; missing storage configuration returns `503`.

### User profile pictures

Avatars belong to the user account and work for homeowners, artisans, and administrators. All avatar routes require a Bearer token and operate on the authenticated account.

| Method and path | Behavior |
| --- | --- |
| `GET /api/v1/users/me/avatar` | Returns `data.avatar` as `{ "url": "https://..." }` or `null` |
| `PUT /api/v1/users/me/avatar` | Creates or replaces the picture; returns `201` for a first upload and `200` for a replacement |
| `DELETE /api/v1/users/me/avatar` | Removes the picture; returns `200` with `data.avatar: null`, including when there is no picture |

Upload exactly one JPEG, PNG, or WEBP image, up to 5MB, as the multipart field `image`. Additional fields and files are rejected. Cloudinary validates the image format and stores a 512 by 512 WEBP image with automatic crop positioning and quality. Upload attempts are limited to 10 per account in 15 minutes.

```bash
curl -X PUT http://localhost:5000/api/v1/users/me/avatar \
  -H 'Authorization: Bearer <token>' \
  -F 'image=@/path/to/photo.jpg'
```

The server saves the new image before removing the previous one. A failed database save or a conflicting account change triggers cleanup of the unattached upload. Concurrent changes return `409`; reload the avatar before retrying. Existing accounts need no data migration.

Cloudinary public IDs, avatar revisions, and pending cleanup records remain internal. Login and admin responses include `avatar`, and public artisan responses include it under `user_id.avatar`. A missing picture is represented by `null`, allowing clients to display a default image. General image uploads are retired; avatar routes attach pictures to accounts and track their cleanup.

Failed cleanup is retained on the account and retried by a bounded background cleanup sweep as well as during the next avatar change or permanent account deletion. Replacing a picture still succeeds if only the previous image's cleanup fails. Deleting a picture returns `503` if external cleanup is pending; the account already has `avatar: null`, and repeating DELETE finishes cleanup. If MongoDB is unavailable while an unattached upload needs cleanup, the server logs its public ID for recovery.

Soft deletion retains pictures for restoration. Permanent deletion first deactivates the account and removes its current and pending avatar images; if Cloudinary cleanup fails, it returns `503` and retains the deactivated account for retry.

Cloudinary configuration is checked for presence at startup. The configured cloud name, API key, and API secret must also be valid for real uploads. Avatar tests exercise multipart requests and MongoDB persistence with the Cloudinary upload and deletion methods mocked, so they do not upload files to a real cloud account.

### Validation and legacy data

New registrations require at least 10 password characters and at most 72 UTF-8 bytes, with uppercase, lowercase, and a digit. Login enforces the byte limit for new accounts; legacy accounts retain login compatibility and can migrate through email password reset. Legacy accounts must reset before sensitive email/password changes. Existing general uploads have no recorded owner and require a separate Cloudinary inventory and cleanup.

Pagination accepts single safe-integer values only. Page defaults to 1 and cannot exceed 1,000,000; limit defaults to 20 and clamps to 1–100. Nonpositive page/limit values clamp to 1. Malformed or repeated pagination values return `400`. Artisan search accepts one string of at most 200 characters.

The canonical API reference is [backend/ENDPOINT_AUDIT.md](backend/ENDPOINT_AUDIT.md).

### Support, reviews and credential recovery

Administrator support queues/resolutions, completed-job homeowner reviews with artisan rating summaries, service-request status filtering, password recovery and verified email/password changes are implemented. See [domain workflows and Mailtrap SMTP setup](backend/DOMAIN_WORKFLOWS.md) for endpoint bodies, session revocation and testing instructions. Real email delivery needs SMTP credentials plus `PASSWORD_RESET_URL`, `EMAIL_CHANGE_URL` and `EMAIL_VERIFY_URL`; the frontend reset/confirmation/verification pages remain unbuilt. Live checkout/webhooks, rescheduling and quote revisions are deferred.


### Automated real-HTTP API scenarios

From `backend/`, run `npm run test:api:all` to launch isolated localhost API servers and test realistic homeowner/artisan journeys without a frontend. Actors register and log in through HTTP; the harness owns a temporary MongoDB database and cleans up its own processes/data. `npm run test:api` runs fast checks, `npm run test:api:journeys` runs real-time booking flows, and `npm run test:api:defaults` optionally checks the normal 15-minute response minimum.

See [API_SCENARIO_TESTING.md](backend/API_SCENARIO_TESTING.md) for safeguards, timing, coverage, reports, payment-simulation boundaries, and CI instructions. Existing deterministic regression tests remain available through `npm test`.
