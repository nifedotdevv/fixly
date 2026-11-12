# Fixly Backend - Endpoint Audit

Base URL: http://localhost:5000
API prefix: /api/v1

Service requests, inspection/repair reservations, quotes, completion and the internal verified-payment boundary are documented in [SERVICE_REQUESTS.md](SERVICE_REQUESTS.md), including endpoint bodies and a Postman walkthrough. These participant-only routes are under `/api/v1/service-requests`; there is no admin booking bypass or public mark-paid endpoint. Unresolved booking obligations now block account deletion/soft deletion and incompatible role changes.

## Authentication

Protected routes require:

```
Authorization: Bearer <token>
```

Tokens are issued by POST /api/v1/auth/login. The JWT payload contains the user id plus standard timestamps; roles are loaded from the database on authenticated requests. Tokens expire after `JWT_EXPIRES_IN` (default `1d`). The server refuses to start without `JWT_SECRET`. Unexpected login failures return a generic 500 response without internal error details.

Middleware (src/middleware/authentication.js):
- requireAuth: Requires a valid Bearer token. Loads the user (password excluded), rejects missing/expired/invalid tokens and soft-deleted users with 401, then sets `req.user`.
- optionalAuth: Attaches `req.user` when a valid token is supplied; otherwise continues as a guest. Invalid or expired tokens are ignored.
- requireRole(...roles): Requires an authenticated user with one of the allowed roles. Returns 401 if not authenticated, 403 for the wrong role.
- requireOwnership({ model, ownerField, param, bypassRoles }): Requires `req.user` and verifies the resource identified by `req.params[param]` belongs to the user. Roles in `bypassRoles` (default `["admin"]`) skip the ownership check. Returns 403 for a non-owner.

Standard failures:
- 401: missing/malformed Authorization header, invalid or expired token, user no longer exists or is soft-deleted.
- 403: authenticated but role is not allowed, or caller does not own the resource.

## Schemas

User (src/models/users.js):
- firstName: string, required
- lastName: string, required
- email: string, required, unique, valid email
- password: stored bcrypt hash, required. Registration accepts at least 10 characters and at most 72 UTF-8 bytes, with lowercase, uppercase and a digit.
- passwordByteLimit: internal password policy marker, excluded from normal queries. New registrations store 72; login rejects longer candidates for these accounts.
- role: string, required, house_owner (default), artisan, admin
- isDeleted: boolean, default false, indexed (soft-delete flag)
- deletedAt: Date, default null (soft-delete timestamp)
- avatar: null by default, or { url, publicId }; publicId is excluded from normal queries
- avatarVersion: internal revision counter, excluded from normal queries
- avatarCleanup: internal list of image public IDs pending deletion, excluded from normal queries
- timestamps: createdAt, updatedAt

ArtisanProfile (src/models/artisanProfile.js):
- user_id: ObjectId ref User, required, unique (one profile per user)
- professional_headline: string, required
- profession: string, required, Carpenter, Plumber, Welder, Brick Layer, Electrician, Auto Mechanic, Painter, Others
- experience_years: number, required
- rating: array of numbers, initialized to [] by the server (forbidden on create and update)
- phone_number: string, required
- starting_price: number, required
- residential_address: string, required
- office_address: string, required
- isDeleted: boolean, default false, indexed (soft-delete flag)
- deletedAt: Date, default null (soft-delete timestamp)
- timestamps: createdAt, updatedAt

## Endpoints

- GET / - Welcome message. Public.
- POST /api/v1/auth/register - Register. Body: firstName, lastName, email, password, confirmPassword, role (optional, defaults to house_owner). Public. 201 on success, 400 validation, 409 duplicate email.
- POST /api/v1/auth/login - Login. Body: email, password. Public. 200 on success with data { id, firstName, lastName, email, role, avatar, token }, 400 validation, 401 invalid credentials. avatar is { url } or null.
- POST /api/v1/artisan/profile - Create profile owned by the authenticated artisan. Requires Bearer auth + artisan role. Body: professional_headline, profession, experience_years, phone_number, starting_price, residential_address, office_address. Supplying user_id or rating is rejected. 201 on success, 400 validation, 401 unauthenticated, 403 non-artisan, 404 user not found, 409 profile exists.
- PATCH /api/v1/artisan/profile/:id - Update profile by profile _id (partial or full). Requires Bearer auth; owner or admin. Body: any of professional_headline, profession, experience_years, phone_number, starting_price, residential_address, office_address. Immutable: user_id, rating, _id, __v (400 if sent). Empty strings rejected. 200 on success, 400 invalid id / empty body, 401 unauthenticated, 403 non-owner, 404 not found.
- GET /api/v1/artisan/profiles - List active profiles whose owners are active artisans (phone/address excluded, user populated with firstName, lastName, role, avatar). Query: profession (must be valid enum), search (matches professional_headline, profession, case-insensitive), page (default 1), limit (default 20, max 100), sortBy (createdAt, experience_years, starting_price; default createdAt), order (asc else desc). Returns data + meta { total, page, limit, totalPages }, counting only visible profiles. avatar is { url } or null; internal image metadata is excluded. Public; optional auth populates req.user for valid tokens. 400 invalid profession.
- GET /api/v1/artisan/profile/me - Return the authenticated artisan's own active professional profile, including their phone and addresses. Ownership always comes from the token, never query parameters. 401 unauthenticated/deactivated account, 403 non-artisan, 404 absent or soft-deleted profile. Registered before /profile/:id so `me` is not interpreted as an ObjectId.
- GET /api/v1/artisan/profile/:id - Get one profile by profile _id (phone/address excluded, user populated). 400 invalid id, 404 if missing, soft-deleted, or its owner is missing, soft-deleted, or no longer an artisan. Public; optional auth populates req.user for valid tokens.
- GET /api/v1/admin/users - List all users (password excluded, sorted createdAt desc). Query: page (default 1), limit (default 20, max 100), includeDeleted=true to show soft-deleted (default hides them). Returns data + meta { total, page, limit, totalPages }. Requires Bearer auth + admin role.
- GET /api/v1/admin/user/:id - Get one user by user _id and any associated artisanProfile, regardless of current role. Query: includeDeleted=true includes soft-deleted users and profiles (default hides deleted users with 404 and omits deleted profiles). Returns { id, firstName, lastName, email, role, avatar, isDeleted, deletedAt, createdAt, updatedAt, artisanProfile }. avatar is { url } or null. 400 invalid id, 404 not found. Requires Bearer auth + admin role.
- PATCH /api/v1/admin/user/:id - Update an active user by user _id. Allowed: firstName, lastName, role. 400 invalid id / empty body / no allowed fields, 404 missing or soft-deleted user, 409 changing away from artisan when any profile exists. Requires Bearer auth + admin role.
- PATCH /api/v1/admin/user/:id/soft-delete - Soft-delete user by user _id. Sets isDeleted=true with the same deletedAt on user and its profile regardless of current role. Returns 200 on repeats and retries profile synchronization; preserves the existing deletion timestamp. 400 invalid id, 404 not found. Requires Bearer auth + admin role.
- PATCH /api/v1/admin/user/:id/restore - Restore user by user _id. Clears isDeleted/deletedAt on user and its profile regardless of current role. Returns 200 on repeats and retries profile synchronization. 400 invalid id, 404 not found. Requires Bearer auth + admin role.
- DELETE /api/v1/admin/user/:id - Deactivate the account, clean its current and pending avatar images, then permanently delete the user and any profile owned by that id regardless of role. A retry finishes pending image or profile cleanup after an earlier partial failure. Returns { id }. 400 invalid id, 404 only when neither user nor profile exists, 503 when image cleanup is pending (account remains deactivated for retry). Requires Bearer auth + admin role.
- GET /api/v1/users/me - Return the authenticated account's personal data: id, firstName, lastName, email, role, avatar URL or null, createdAt, updatedAt. Supports all roles. Excludes password, password policy, image provider IDs, cleanup metadata, and professional fields. 401 unauthenticated/deactivated account.
- GET /api/v1/users/me/avatar - Return the authenticated user's avatar as { url } or null. 200 on success, 401 unauthenticated or deactivated account.
- PUT /api/v1/users/me/avatar - Add or replace the authenticated user's avatar. Multipart field image, one JPEG/PNG/WEBP file up to 5MB, no extra fields. Cloudinary validates the input and produces a 512x512 WEBP image. 201 first upload, 200 replacement, 400 invalid multipart/image, 401 unauthenticated, 409 stale account/avatar revision, 413 file too large, 429 more than 10 upload attempts in 15 minutes per account, 503 missing storage configuration or provider authentication/availability failures. Provider messages are not exposed to clients.
- DELETE /api/v1/users/me/avatar - Clear the authenticated user's avatar and delete its image plus any pending cleanup images. 200 with avatar null, including repeats; 401 unauthenticated; 409 stale account/avatar revision; 503 if cleanup is pending. On 503 the avatar is already null; repeat the same request to finish cleanup.
- POST /api/v1/uploads/image - Retired. Returns 401 without authentication or 410 with instructions to use PUT /api/v1/users/me/avatar. Does not parse multipart data or contact image storage.
- PATCH /api/v1/users/:id - Update own name by user _id. Allowed: firstName, lastName. 400 invalid id / empty body / no allowed fields, 404 not found. Requires Bearer auth; self or admin.
- All unmatched routes - 404 { statusCode: 404, success: false, message: "Route not found" }.

Delete, soft-delete, and restore retain their existing URLs and share a MongoDB lock keyed by account id. Competing lifecycle requests for the same account return 409 without changing the user/profile or the current lock. Different accounts can proceed independently, including across API processes. The lock also covers orphan-profile cleanup. Responses are sent after lock release.

Lifecycle writes support standalone MongoDB and remain non-atomic. An ordinary cascade failure releases the lock and returns 500; retrying the same request finishes the profile update or cleanup. Pending image cleanup returns 503 and also releases the lock. Public profile reads independently require an active artisan owner, so failed cascades do not expose profiles of deactivated or missing users.

Locks in `accountlifecyclelocks` have no TTL. A process crash, database driver error with a potentially unknown write outcome, or failed lock release requires operator recovery after proving the old operation can no longer write; never delete a lock based only on age. Ordinary application errors release the lock for retry; database driver errors conservatively retain it. See [account lifecycle recovery](ACCOUNT_LIFECYCLE.md). This coordination covers lifecycle endpoints, not all application writes, and does not replace multi-document transactions.

Personal and professional reads and edits remain separate. Account lifecycle actions affect both records. Backend administrator self-demotion/deletion behavior is unchanged by product direction; frontend confirmation is deferred and does not prevent direct API calls.

List pagination accepts single integer query values only. Missing page/limit default to 1/20; nonpositive values still clamp to 1 and limits above 100 clamp to 100. Repeated, malformed, or unsafe integers and pages above 1,000,000 return 400. Artisan search accepts one string of at most 200 characters; repeated search/profession/sortBy/order parameters return 400.

Legacy accounts without passwordByteLimit retain their existing login behavior to avoid locking out users. Their original password length cannot be recovered from bcrypt hashes; resolving historical truncation requires a separate password reset/migration. Previously uploaded general images have no recorded ownership and require a separate Cloudinary inventory and cleanup. Retiring the endpoint prevents new untracked assets; it does not delete existing provider assets.

Avatar changes use a conditional user update and an internal revision counter to reject conflicting uploads or removals. Old-image cleanup is queued in the same user update that changes the avatar. A successful replacement is retained if only old-image cleanup fails; queued cleanup is retried on subsequent avatar changes and permanent account deletion. Soft deletion preserves avatar images. Cloudinary and MongoDB changes are not one atomic transaction, and cleanup has no background worker. If MongoDB is unavailable while recording an unattached upload, its public ID is logged for manual recovery.

## Request Body Schemas

POST /api/v1/auth/register (Joi: registerValidationSchema):
- firstName: string, trimmed, required
- lastName: string, trimmed, required
- email: string, trimmed, lowercased, valid email, required
- password: string, required, at least 10 characters and at most 72 UTF-8 bytes, must contain lowercase, uppercase and a digit
- confirmPassword: must match password when provided
- role: "house_owner" | "artisan", default "house_owner"; public admin registration is rejected
- Unknown fields are stripped.

POST /api/v1/auth/login (Joi: loginValidationSchema):
- email: string, trimmed, lowercased, valid email, required
- password: string, required

POST /api/v1/artisan/profile (Joi: profileCreateSchema):
- user_id: forbidden; ownership comes from the authenticated user
- professional_headline: string, trimmed, min 3 chars, required
- profession: one of Carpenter, Plumber, Welder, Brick Layer, Electrician, Auto Mechanic, Painter, Others, required
- experience_years: number >= 0, required
- phone_number: string, trimmed, min 7 chars, required
- starting_price: number >= 0, required
- residential_address: string, trimmed, min 3 chars, required
- office_address: string, trimmed, min 3 chars, required
- rating: forbidden; new profiles use the model default []

PATCH /api/v1/artisan/profile/:id (Joi: profileUpdateSchema):
- At least one of: professional_headline (min 3), profession (valid enum), experience_years (>= 0), phone_number (min 7), starting_price (>= 0), residential_address (min 3), office_address (min 3)
- Immutable: user_id, rating, _id, __v (400 if sent)
- Empty strings for updatable fields are rejected by the controller

PATCH /api/v1/admin/user/:id (controller-level validation):
- At least one of: firstName (string), lastName (string), role ("house_owner" | "artisan" | "admin")
- If any artisan profile exists, including a soft-deleted profile, role must remain artisan (409 otherwise).
- Other fields are ignored; 400 if no allowed field is supplied

PATCH /api/v1/users/:id (controller-level validation):
- At least one of: firstName (string), lastName (string)
- Other fields are ignored; 400 if no allowed field is supplied

## DB Snapshot (fixly-backend @ 2026-10-12, passwords omitted)

15 users, 5 profiles.

```json
{
  "users": [
    {
      "_id": "6ac7b039ffc97119b1c64a0b",
      "firstName": "daniel",
      "lastName": "Adeyemi",
      "email": "ada.adeyemi0@fixly.test",
      "role": "house_owner",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.914Z",
      "updatedAt": "2026-10-08T15:20:19.458Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a0c",
      "firstName": "Bola",
      "lastName": "Balogun",
      "email": "bola.balogun1@fixly.test",
      "role": "artisan",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a0d",
      "firstName": "Chidi",
      "lastName": "Okafor",
      "email": "chidi.okafor2@fixly.test",
      "role": "admin",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a0e",
      "firstName": "Dora",
      "lastName": "Eze",
      "email": "dora.eze3@fixly.test",
      "role": "house_owner",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a0f",
      "firstName": "Emeka",
      "lastName": "Ibrahim",
      "email": "emeka.ibrahim4@fixly.test",
      "role": "artisan",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a10",
      "firstName": "Fatima",
      "lastName": "Sule",
      "email": "fatima.sule5@fixly.test",
      "role": "admin",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a11",
      "firstName": "Gbenga",
      "lastName": "Ojo",
      "email": "gbenga.ojo6@fixly.test",
      "role": "house_owner",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a12",
      "firstName": "Hauwa",
      "lastName": "Daniels",
      "email": "hauwa.daniels7@fixly.test",
      "role": "artisan",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a13",
      "firstName": "Ibrahim",
      "lastName": "Bello",
      "email": "ibrahim.bello8@fixly.test",
      "role": "admin",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.915Z",
      "updatedAt": "2026-10-08T15:01:13.915Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a14",
      "firstName": "Jide",
      "lastName": "Alabi",
      "email": "jide.alabi9@fixly.test",
      "role": "house_owner",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.916Z",
      "updatedAt": "2026-10-08T15:01:13.916Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a15",
      "firstName": "Kemi",
      "lastName": "Ogunleye",
      "email": "kemi.ogunleye10@fixly.test",
      "role": "artisan",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.916Z",
      "updatedAt": "2026-10-08T15:01:13.916Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a16",
      "firstName": "Lanre",
      "lastName": "Adebayo",
      "email": "lanre.adebayo11@fixly.test",
      "role": "admin",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.916Z",
      "updatedAt": "2026-10-08T15:01:13.916Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a17",
      "firstName": "Musa",
      "lastName": "Yusuf",
      "email": "musa.yusuf12@fixly.test",
      "role": "house_owner",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.916Z",
      "updatedAt": "2026-10-08T15:01:13.916Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a18",
      "firstName": "Ngozi",
      "lastName": "Nwosu",
      "email": "ngozi.nwosu13@fixly.test",
      "role": "artisan",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.916Z",
      "updatedAt": "2026-10-08T15:01:13.916Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a19",
      "firstName": "Olumide",
      "lastName": "Bakare",
      "email": "olumide.bakare14@fixly.test",
      "role": "admin",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.916Z",
      "updatedAt": "2026-10-08T15:01:13.916Z"
    }
  ],
  "profiles": [
    {
      "_id": "6ac7b039ffc97119b1c64a1d",
      "user_id": "6ac7b039ffc97119b1c64a15",
      "professional_headline": "Expert Brick Layer with 5+ years experience",
      "profession": "Brick Layer",
      "experience_years": 6,
      "rating": [],
      "phone_number": "08031333333",
      "starting_price": 9500,
      "residential_address": "15 Allen Avenue, Ikeja, Lagos",
      "office_address": "8 Workshop Road, Yaba, Lagos",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.994Z",
      "updatedAt": "2026-10-08T15:01:13.994Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a1a",
      "user_id": "6ac7b039ffc97119b1c64a0c",
      "professional_headline": "Expert Carpenter with 5+ years experience",
      "profession": "Carpenter",
      "experience_years": 3,
      "rating": [],
      "phone_number": "08031000000",
      "starting_price": 5000,
      "residential_address": "12 Allen Avenue, Ikeja, Lagos",
      "office_address": "5 Workshop Road, Yaba, Lagos",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.993Z",
      "updatedAt": "2026-10-08T15:01:13.993Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a1e",
      "user_id": "6ac7b039ffc97119b1c64a18",
      "professional_headline": "Expert Electrician with 5+ years experience",
      "profession": "Electrician",
      "experience_years": 7,
      "rating": [],
      "phone_number": "08031444444",
      "starting_price": 11000,
      "residential_address": "16 Allen Avenue, Ikeja, Lagos",
      "office_address": "9 Workshop Road, Yaba, Lagos",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.994Z",
      "updatedAt": "2026-10-08T15:01:13.994Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a1b",
      "user_id": "6ac7b039ffc97119b1c64a0f",
      "professional_headline": "Expert Plumber with 5+ years experience",
      "profession": "Plumber",
      "experience_years": 4,
      "rating": [],
      "phone_number": "08031111111",
      "starting_price": 6500,
      "residential_address": "13 Allen Avenue, Ikeja, Lagos",
      "office_address": "6 Workshop Road, Yaba, Lagos",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.994Z",
      "updatedAt": "2026-10-08T15:01:13.994Z"
    },
    {
      "_id": "6ac7b039ffc97119b1c64a1c",
      "user_id": "6ac7b039ffc97119b1c64a12",
      "professional_headline": "Expert Welder with 5+ years experience",
      "profession": "Welder",
      "experience_years": 5,
      "rating": [],
      "phone_number": "08031222222",
      "starting_price": 8000,
      "residential_address": "14 Allen Avenue, Ikeja, Lagos",
      "office_address": "7 Workshop Road, Yaba, Lagos",
      "__v": 0,
      "createdAt": "2026-10-08T15:01:13.994Z",
      "updatedAt": "2026-10-08T15:01:13.994Z"
    }
  ]
}
```


## Account recovery additions (2026-11-12)

- Authenticated `DELETE /api/v1/users/me` requires current-password confirmation; soft deletion revokes sessions and starts a configurable 30-day recovery window.
- `POST /api/v1/auth/reactivate` verifies email/password and restores only self-deleted accounts within that window; log in afterward for a new JWT. Invalid credentials or ineligible accounts return 401.
- Registration accepts optional `previousPassword`. With correct proof, a self-deleted account within the window returns 409 with recovery options. After the window it is permanently removed before creating a fresh account with a new id. Missing/incorrect proof, admin deactivation, unknown deletion metadata, or active accounts return generic 409. Existing booking obligations and provider cleanup can still block deletion.
- Admin soft deletion remains an administrative restriction; public recovery cannot bypass it. Every soft deletion revokes previous JWTs.
- Pending lifecycle work and queued avatar cleanup now receive bounded background repair. Uncertain-write locks still require exact-token operator recovery after fencing old writers.

See [ACCOUNT_LIFECYCLE.md](ACCOUNT_LIFECYCLE.md) for configuration, recovery tooling, retry behavior, and deployment limitations.
