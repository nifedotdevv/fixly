# Account lifecycle coordination and recovery

## API behavior

All three existing admin-only endpoints use one shared coordinator:

- `PATCH /api/v1/admin/user/:id/soft-delete` deactivates the user and their professional profile, preserving avatars.
- `PATCH /api/v1/admin/user/:id/restore` restores the user and their professional profile.
- `DELETE /api/v1/admin/user/:id` deactivates the account, cleans current and queued avatar images, and removes the user and professional profile.

Personal names/avatar and professional fields remain separate for reads and edits. Account lifecycle actions affect both records regardless of the user's current role. Admin deletion confirmation is deferred to the frontend; no backend last-administrator guard is introduced.

A unique MongoDB document in `accountlifecyclelocks`, keyed by account ObjectId, is acquired before lifecycle reads or writes. Other lifecycle actions for that account return 409 until the operation releases its lock. This coordinates separate server processes and supports standalone MongoDB. Different account ids remain independent. The lock also covers orphan-profile cleanup after an earlier permanent deletion partially completed.

Profile creation and admin role changes use this coordinator too. Service-request creation, transitions and internal verified-payment processing acquire both participant locks in ascending ObjectId order. An artisan's lock protects overlap checks through reservation writes across all their requests. The lock schema requests majority-acknowledged writes. See [SERVICE_REQUESTS.md](SERVICE_REQUESTS.md) for the scheduling and payment-event guarantees.

Deletion and soft deletion are rejected before account changes while unresolved service requests, reservations, work, payment obligations or reported problems exist. Role changes that would invalidate participation are blocked too. Effective response/payment/quote expiry is recognised even before maintenance materialises it. Resolved history does not itself prevent deletion, and service requests/payment events are never cascade-deleted. Processing or reconciliation-required payment events remain support obligations.

This is mutual exclusion, not a multi-document transaction. Public profile reads independently verify that the owner is active. The first user-state write atomically records a private `lifecycleAction` intent (`soft-delete`, `restore`, or `delete`). Once profile work succeeds, that intent is cleared. Permanent deletion removes the profile before the user, preserving the durable intent until its dependencies are removed.

Ordinary application errors release the lock before returning 500. The next coordinated operation finishes pending intent before applying a new action. Permanent-delete intent cannot be canceled by restoration. A bounded maintenance pass repairs up to 20 pending accounts immediately after startup and every `LIFECYCLE_RECOVERY_INTERVAL_MS` (default 60 seconds); maintenance does not delay HTTP startup. It uses the same locks as API requests and rotates past blocked accounts. Driver errors and process crashes can retain locks; these accounts require verified recovery below before repair can continue.

Pending Cloudinary deletion returns 503 and releases the lock. A later background pass or permanent-delete retry finishes cleanup. Completed repeated soft-delete/restore requests remain supported. Permanent deletion returns 404 when neither user nor profile exists. Service request and payment history retains the old account id and is never transferred to a replacement account.

## Crash recovery

Locks contain an account id, random token, action, start time, host, and process id. They have no TTL and must never be cleared based only on age: an old operation may still be running, especially while waiting for a provider or database. A terminated API process, database driver error, or failed lock release can leave a lock in place; subsequent lifecycle actions return 409. Database driver errors conservatively retain the lock because the outcome of an earlier write may be unknown. Recovery-required errors log the account id for investigation.

A trusted database operator must:

1. Inspect the lock for the affected account in `accountlifecyclelocks`. Confirm the intended action and identify its host/process.
2. Stop or otherwise prove termination of that operation's server instance. Verify it cannot resume any pending writes. If its status is uncertain, keep the lock.
3. Remove only the inspected lock using both its `_id` and exact `token` as the deletion filter. Never bulk-clear locks or enable a TTL index.
4. Retry the intended admin lifecycle endpoint or let the pending-intent worker resume it. Inspect the user/profile state and pending image cleanup after completion.

From `backend/`, inspect without mutation:

```sh
npm run lifecycle:inspect -- --id <account-id>
```

After stopping/fencing the old writers **and confirming their dispatched database operations have finished**, remove only the exact inspected token:

```sh
npm run lifecycle:inspect -- --id <account-id> --token <inspected-token> --confirm-writers-stopped
```

The confirmation flag is the operator's assertion, not an automated proof. A wrong or replaced token removes nothing. Never use this command merely because a heartbeat, timestamp, or process appears old.

If process termination cannot be established, recovery must wait. Automatic failover would require a separately designed fencing/transaction mechanism; this implementation deliberately does not treat lease expiry as proof of exclusivity.

Locks coordinate lifecycle endpoints, profile creation, role changes and booking mutations. They do not make multi-document writes transactional. When recovering a booking/payment operation, inspect both the request's embedded verified references and the separate payment-event receipt; replay the same verified reference after exact-token lock recovery instead of creating a new one. A replica set and broader transaction/reconciliation design would be needed if atomic multi-document updates become a product requirement.


## Self deletion, reactivation, and email reuse

- `DELETE /api/v1/users/me`: authenticated, accepts `{ "password": "current password" }`, limited to 10 attempts per account in 15 minutes. Rechecks credentials and booking obligations inside the lifecycle lock, soft-deletes the user/profile, and records private `deletionReason: "self"`. All soft deletions, including admin actions, increment a private session version so earlier JWTs remain invalid after restoration.
- `POST /api/v1/auth/reactivate`: accepts `{ "email": "owner@example.com", "password": "current password" }`. Only self-deleted accounts with a known `deletedAt` within `SOFT_DELETE_GRACE_DAYS` (default 30 days) are eligible. Restores the original user/profile and role. The user must log in again to obtain a fresh token. Login itself never silently restores an account.
- `POST /api/v1/auth/register`: during grace the email stays reserved. Supplying the correct optional `previousPassword` returns 409 with recovery options; absent/incorrect proof returns the ordinary duplicate-email response. At or after the deadline, correct `previousPassword` permits a fresh account using the requested new password. Eligibility and ownership are rechecked under the account lock, the old account is permanently deleted, then a new id is created. No old profile, role, ratings, bookings, or payment history is inherited.

Admin-deactivated accounts and legacy records without a self-deletion reason or reliable deletion date require admin handling. Repeating admin soft deletion on a self-deleted account makes the restriction administrative. Public reactivation and re-registration cannot bypass it. Unique email and one-profile-per-user indexes remain global, including deleted records, until authorized permanent deletion releases them. There is no automatic age-only purge; the grace deadline governs the credential-verified restart path.

This implementation proves continuity with the previous password. It does not provide email delivery or a forgot-password flow. A user who has lost that password needs administrator assistance until a verified email recovery integration is added. New ordinary registrations retain the existing email verification behavior.

## Background avatar cleanup

Queued obsolete images are swept immediately after startup and periodically while Cloudinary is configured. Each pass claims at most `AVATAR_CLEANUP_BATCH_SIZE` (default 20) accounts using atomic, token-scoped claims and MongoDB server time. Failed accounts receive a retry delay so they do not monopolize later batches. Current avatars remain protected by the existing cleanup guard. Provider calls remain idempotent (`not found` counts as successful deletion).

The claim is a work-distribution hint, not the lifecycle safety lock. A pass that outlives its claim can cause duplicate idempotent provider deletion calls; a late worker cannot clear a newer claim. Request-driven cleanup and lifecycle cleanup can also overlap safely. Untracked uploads that were never persisted still require provider inventory/manual recovery.

Settings are positive bounded integers, read after environment loading:

| Setting | Default | Maximum |
| --- | ---: | ---: |
| `SOFT_DELETE_GRACE_DAYS` | 30 | 3650 |
| `LIFECYCLE_RECOVERY_INTERVAL_MS` | 60000 | 86400000 |
| `AVATAR_CLEANUP_INTERVAL_MS` | 300000 | 86400000 |
| `AVATAR_CLEANUP_BATCH_SIZE` | 20 | 1000 |
| `AVATAR_CLEANUP_RETRY_MS` | 300000 | 86400000 |
| `AVATAR_CLEANUP_CLAIM_MS` | 60000 | 3600000 |

Background passes never overlap within one scheduler. Timers are unreferenced and absent when the app is imported in tests. SIGINT/SIGTERM stops incoming traffic, drains in-flight requests and maintenance, then disconnects MongoDB. Different server instances coordinate lifecycle recovery through account locks and avatar sweeps through claims.


## Design references

MongoDB documents [single-document atomicity and replica-set transactions](https://www.mongodb.com/docs/manual/core/transactions/) and [TTL index deletion behavior](https://www.mongodb.com/docs/manual/core/index-ttl/). Expiring a lock document does not fence its prior writer. Recovery therefore retains explicit stopped-writer verification. OWASP's [authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [email verification guidance](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html) inform credential confirmation and the distinction between prior-password proof and inbox verification.
