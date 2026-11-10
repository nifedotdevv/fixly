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

This is mutual exclusion, not a multi-document transaction. Public profile reads independently verify that the owner is active. Ordinary application errors release the lock before returning 500, and retrying the same action repairs partial profile changes. Pending Cloudinary deletion returns 503 and releases the lock; retry permanent deletion to finish cleanup. Completed repeated soft-delete/restore requests remain supported. Permanent deletion returns 404 when neither user nor profile exists.

## Crash recovery

Locks contain an account id, random token, action, start time, host, and process id. They have no TTL and must never be cleared based only on age: an old operation may still be running, especially while waiting for a provider or database. A terminated API process, database driver error, or failed lock release can leave a lock in place; subsequent lifecycle actions return 409. Database driver errors conservatively retain the lock because the outcome of an earlier write may be unknown. Recovery-required errors log the account id for investigation.

A trusted database operator must:

1. Inspect the lock for the affected account in `accountlifecyclelocks`. Confirm the intended action and identify its host/process.
2. Stop or otherwise prove termination of that operation's server instance. Verify it cannot resume any pending writes. If its status is uncertain, keep the lock.
3. Remove only the inspected lock using both its `_id` and exact `token` as the deletion filter. Never bulk-clear locks or enable a TTL index.
4. Retry the intended admin lifecycle endpoint. Inspect the user/profile state and pending image cleanup after completion.

If process termination cannot be established, recovery must wait. Automatic failover would require a separately designed fencing/transaction mechanism; this implementation deliberately does not treat lease expiry as proof of exclusivity.

Locks coordinate lifecycle endpoints, profile creation, role changes and booking mutations. They do not make multi-document writes transactional. When recovering a booking/payment operation, inspect both the request's embedded verified references and the separate payment-event receipt; replay the same verified reference after exact-token lock recovery instead of creating a new one. A replica set and broader transaction/reconciliation design would be needed if atomic multi-document updates become a product requirement.
