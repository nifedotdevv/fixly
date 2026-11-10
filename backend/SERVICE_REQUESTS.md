# Service requests, inspections and repairs

This milestone adds participant-only service requests, inspection reservations, immutable repair quotes and a verified-payment service boundary. It does not integrate a payment provider. Acceptance and quote approval are not payment. The backend records trusted verification events; it does not collect, hold, release or refund funds.

## Models and access

`ServiceRequest` stores immutable homeowner/artisan ObjectIds, original description, private service address, requested inspection window and response deadline. It also stores append-only clarification notes, booking stage and timestamps, an accepted inspection fee snapshot, separate embedded inspection/repair appointments, one quote, verified-event summaries and any reported problem. Related state changes are committed as a single document write with optimistic concurrency enabled.

`PaymentEvent` uses a namespaced external reference as its unique MongoDB `_id`. It records the request, participants, purpose, expected amount/currency and `processing`, `applied` or `reconciliation_required` outcome. The event registry plus the embedded verified reference support recovery if the process stops between the request write and receipt finalisation. Records are not deleted with an account.

Authentication uses the existing Bearer JWT middleware. An active `house_owner` creates a request for an active `artisan` with a non-deleted professional profile. Both accounts are rechecked under their account locks for mutations. Self-booking is rejected. Only the requesting homeowner and assigned artisan can read a request; unrelated users, artisans and admins receive 404. There is no broad admin booking bypass. The assigned artisan can read the service address immediately after submission. No request data is joined into the public artisan directory.

List/detail responses deliberately return participant IDs, not populated user documents. Payment responses omit external references. Account removal preserves request and payment-event history; a remaining active participant can still read resolved history. A different future data-retention/privacy policy is outside this milestone.

## Dates, amounts and configurable bounds

- Supply complete ISO timestamps with seconds and an explicit timezone, for example `2027-01-12T09:00:00Z` or `2027-01-12T10:00:00+01:00`. Storage and responses use UTC. Local timestamps without an offset and impossible calendar dates are rejected.
- All appointment windows must start in the future when submitted/accepted and end strictly after their start. Windows are half-open: `[start, end)`. Adjacent windows do not overlap.
- The homeowner chooses `responseDeadline`: at submission it must be at least `REQUEST_RESPONSE_MIN_MINUTES` away (default **15**), at most `REQUEST_RESPONSE_MAX_MINUTES` away (default **10080**, seven days), and no later than inspection start. These environment settings must be positive integers; minimum must not exceed maximum.
- An accepted inspection reservation expires after `INSPECTION_PAYMENT_MINUTES` (default **30**), capped at inspection start.
- An approved repair reservation expires after `REPAIR_DEPOSIT_MINUTES` (default **1440**, 24 hours), capped at both quote expiry and repair start.
- Money is an integer amount in minor units, with an uppercase currency code supported by the Node/ICU currency list (for example `NGN`, `USD`). The caller/provider must use that currency's minor unit. No exchange conversion is performed. Inspection fees must be positive. Repair totals must be at least **4 minor units**, ensuring both payment instalments are positive.
- Deposit is `ceil(total * 70 / 100)`. Balance is `total - deposit`; their sum is always exactly the total. Integer/BigInt arithmetic avoids floating point multiplication errors. For 10001 minor units: deposit **7001**, balance **3000**. These are payment-schedule amounts, not an arbitration/refund policy.

## API

All paths below are relative to `/api/v1/service-requests`; all require authentication. Unknown body fields are rejected, including ownership, status, appointment-state and payment flags. No general PATCH/revision endpoint exists. POST actions without parameters accept `{}` only.

| Method and path | Participant | Body / result |
| --- | --- | --- |
| `POST /` | Homeowner | Create the request; example below. Returns 201. |
| `GET /?page=1&limit=20` | Either | Own participant requests, newest first; existing pagination bounds apply (maximum 100 per page). |
| `GET /:id` | Either | Own request detail, including private address. |
| `POST /:id/notes` | Homeowner | `{ "text": "The tap is upstairs" }`, pending only. Maximum 100 notes, 2000 characters each. |
| `POST /:id/accept` | Assigned artisan | `{ "inspectionFee": { "amount": 250000, "currency": "NGN" } }` |
| `POST /:id/reject` | Assigned artisan | `{ "reason": "Cannot accommodate this time" }`, pending only, maximum 500 characters. |
| `POST /:id/cancel` | Homeowner | Pending/unpaid reservations only; see cancellation policy. |
| `POST /:id/inspection/complete` | Assigned artisan | Confirmed inspection only, after its window ends. |
| `POST /:id/quote` | Assigned artisan | Immutable quote after inspection completion; example below. |
| `POST /:id/quote/approve` | Homeowner | Unexpired quote; reserves repair window, awaits deposit. |
| `POST /:id/quote/decline` | Homeowner | Unexpired quote; ends repair progression. |
| `POST /:id/repair/start` | Assigned artisan | Requires verified deposit confirmation and repair start time reached. |
| `POST /:id/repair/complete` | Assigned artisan | Requires started work; awaits homeowner confirmation. |
| `POST /:id/completion/confirm` | Homeowner | Acknowledges reported completion; makes final balance payable. |
| `POST /:id/problems` | Homeowner | `{ "explanation": "The tap still leaks" }`, after reported completion. |

Create example (replace IDs/timestamps with eligible accounts and future values):

```json
{
  "artisan": "012345678901234567890123",
  "description": "Repair the leaking kitchen tap",
  "serviceAddress": "12 Example Street, apartment 3, Lagos",
  "inspectionWindow": {
    "start": "2027-01-12T09:00:00Z",
    "end": "2027-01-12T10:00:00Z"
  },
  "responseDeadline": "2027-01-11T18:00:00Z"
}
```

Quote example:

```json
{
  "scope": "Replace the tap and damaged connecting fittings",
  "total": { "amount": 10001, "currency": "NGN" },
  "repairWindow": {
    "start": "2027-01-14T09:00:00Z",
    "end": "2027-01-14T11:00:00Z"
  },
  "expiresAt": "2027-01-13T18:00:00Z"
}
```

The quote expiry must be in the future and no later than repair start. The quote's scope, amount, currency, window and expiry cannot be replaced. Approval/decline timestamps are tracked separately. There are no revisions, alternative time proposals or counteroffers. Changing the original artisan, scope, address or inspection window requires cancelling an eligible unpaid request and submitting a new one. Confirmed details cannot be overwritten.

Responses follow the existing `{ statusCode, success, message, data }` convention; lists also include `meta`. Invalid input is 400, unauthenticated access 401, a participant using the other participant's action 403, unrelated/missing requests 404, and stage/reservation/account-lock conflicts 409. Internal payment amount/purpose/currency mismatches are 422. Clients may retry a 409 lock conflict after reloading current state; do not treat a failed action as success.

## Stages and expiry

```text
pending
  -> rejected | response_expired | cancelled
  -> awaiting_inspection_payment
       -> inspection_payment_expired | cancelled
       -> inspection_confirmed            [verified inspection event only]
            -> inspection_completed        [artisan; inspection end reached]
                 -> quote_submitted
                      -> quote_expired | repair_not_proceeding
                      -> awaiting_repair_deposit
                           -> repair_payment_expired | repair_not_proceeding
                           -> repair_confirmed         [verified deposit event only]
                                -> repair_in_progress  [artisan; repair start reached]
                                     -> awaiting_homeowner_confirmation
                                          -> problem_reported
                                          -> awaiting_final_payment
                                               -> completed [verified balance event only]
```

Booking progress is separate from appointment state (`reserved`, `confirmed`, `completed`, `released`, `expired`) and verified-event summaries. Inspection and repair appointments remain distinguishable. Artisan acceptance snapshots the explicitly agreed fee and keeps the original requested inspection window; later profile starting-price changes cannot change it. Quote approval does not permit work. Neither acceptance nor approval inserts a verified payment summary.

Effective expiry uses the current server UTC time on every response, mutation, reservation check and account-obligation query, including at equality with the deadline. An unanswered request, unpaid reservation or submitted quote is expired even if its stored status has not been materialised yet. Deadline-dependent transitions also include a MongoDB `$$NOW` predicate on the atomic save: expiry during processing cannot turn into a late acceptance, approval or payment confirmation. Keep application/database clocks synchronised. Expired reservations do not block availability. Expiry never deletes history or revives an old acceptance.

`expireServiceRequests(filter?, now?)` in `src/services/requests/rules.js` can materialise expired statuses for maintenance/reporting using conditional atomic updates. Correctness does not require a cron job, Redis, TTL deletion or queue. Its writes increment the request version, so a concurrently loaded stale document cannot overwrite an expiry. HTTP lists currently return all participant history with effective status; filtering by status is not implemented.

Confirmed appointments do not expire when their earlier payment deadline passes. Inspection completion requires the original window to have ended. Repair work may start once its confirmed window begins; paid appointments do not silently auto-cancel if their window is missed. Scheduling protects planned windows; overruns and rescheduling need a future support policy.

## Cancellation, account lifecycle and problems

Homeowners can cancel pending requests and unpaid inspection reservations. Their inspection reservation is released and the request becomes `cancelled`. Cancelling an unpaid repair reservation releases that repair reservation and ends repair progression as `repair_not_proceeding`; the completed inspection and its verified-event history stay unchanged. This does not reverse an inspection payment or imply any refund.

Ordinary cancellation of a confirmed appointment, work, completion awaiting confirmation, final balance obligation or reported problem is rejected with an explanation. Resolving those cases requires a future support policy. Quote decline and expiry retain inspection history. A reported problem requires an explanation and blocks homeowner confirmation, normal final payment and settlement. No arbitration, admin resolution, automatic refunds or automatic payments exist.

Deletion, soft deletion and role changes that invalidate participation return 409 while either participant has unresolved requests, reservations, inspection/repair work, final-balance obligations, reported problems, or processing/reconciliation-required payment events. This guard runs under the existing account lock, before deactivation or user/profile changes. Unanswered/unpaid effective expiry, rejection, safe cancellation, quote decline/expiry and completed bookings do not block deletion by themselves. A late verified event still requiring reconciliation is a new unresolved support obligation; its event is preserved and blocks deletion of remaining participant accounts until a future support workflow resolves it. A late event cannot restore an already deleted account.

## Reservation and lifecycle concurrency guarantee

Standalone MongoDB is supported; no multi-document transactions are assumed. Every booking mutation acquires both participant account locks in ascending ObjectId order, before reading eligibility or booking state. Different requests for the same artisan therefore share the artisan lock. The overlap query checks both inspection and repair appointments and is held through the reservation save. It uses MongoDB `$$NOW` for reservation validity, matching the database clock used at payment confirmation: an application instance with a fast clock cannot release a slot while another instance can still confirm it. Pending requests reserve nothing. Both a live temporary reservation and a confirmed appointment block overlapping acceptance/approval; adjacent windows are allowed. Only one of two concurrent conflicting operations can create a reservation. The loser receives 409, either from contention or the subsequent overlap check. This is shared database coordination across processes, not an in-memory mutex or best-effort read/insert.

Account deletion, profile creation and role changes participate in the same locking system. Fresh participant checks inside the booking locks prevent a request authenticated before deletion/role change from creating an invalid active booking. Optimistic concurrency additionally protects against maintenance expiry updates.

Deployment requirements and limitations:

- Use one authoritative MongoDB database shared by all API processes. Participant locks use the collection's mandatory unique `_id` index; payment references use a separate mandatory unique `_id` index.
- Use primary reads. The application database connection explicitly selects primary reads, and booking/event models do so as well. The lock, booking and event schemas request majority-acknowledged writes. MongoDB must support these acknowledgements; failure is returned rather than weakening the guarantee.
- Do not write bookings or bypass lifecycle guards from other applications/operators. Any future booking writer or rescheduling endpoint must use the same locks.
- Locks have **no expiry or TTL**. If a process crashes, a database write has an uncertain outcome, or release fails, a lock can remain and block work. This deliberately sacrifices automatic failover rather than letting an old writer resume after another writer has taken over. Read `ACCOUNT_LIFECYCLE.md` before recovery.
- The two-account operation is not a transaction. A request document update is atomic; receipt finalisation is a separate recoverable write. Application errors can leave a processing payment receipt; database errors conservatively retain acquired locks. Prove that the old writer cannot resume, inspect its outcome, then recover only exact lock tokens. Never delete an event merely to make its reference reusable.

## Verified payment boundary and local simulation

Only trusted server code may call:

```js
import { applyVerifiedPayment } from './src/services/requests/verifiedPayments.js';
await applyVerifiedPayment({
  requestId: '012345678901234567890123',
  purpose: 'inspection', // or repair_deposit / repair_balance
  amount: 250000,
  currency: 'NGN',
  externalReference: 'future-provider:unique-success-reference'
});
```

A future provider caller must authenticate the provider event, verify a successful outcome and bind signed metadata to this request/purpose before invoking the function. This function is not provider verification and is not an HTTP endpoint. There is no public `mark-paid` route and request bodies cannot supply payment flags.

The boundary checks request/purpose, expected integer amount and currency, the current stage, live reservation and global reference uniqueness. Repeated identical events return the stored outcome without advancing twice. Reusing a reference with different details/request is rejected. The booking's stage, appointment and embedded payment reference update atomically. If receipt finalisation failed after that write, replay identifies the embedded reference and finishes the same receipt without applying the transition twice.

An inspection event confirms only a still-valid inspection reservation. A deposit event confirms only a still-valid repair reservation. A final-balance event is eligible only after homeowner confirmation and cannot finalise a reported problem. A correct event arriving after an unpaid reservation expires or is released is recorded as `reconciliation_required`; it cannot reclaim the slot, change to confirmed, or imply a refund. Replaying that event returns the same reconciliation outcome. Unexpected duplicate events with different references require adapter/support attention; no second stage advance occurs.

For local development/testing only, disabled by default:

```bash
NODE_ENV=development ENABLE_PAYMENT_SIMULATION=true \
  node scripts/simulate-request-payment.js REQUEST_ID inspection 250000 NGN dev:inspection:1
# After quote approval:
NODE_ENV=development ENABLE_PAYMENT_SIMULATION=true \
  node scripts/simulate-request-payment.js REQUEST_ID repair_deposit 7001 NGN dev:deposit:1
# After homeowner completion confirmation:
NODE_ENV=development ENABLE_PAYMENT_SIMULATION=true \
  node scripts/simulate-request-payment.js REQUEST_ID repair_balance 3000 NGN dev:balance:1
```

The CLI refuses missing/production environments or an absent explicit enable flag **before connecting**. Use only a development/test database URI (`MONGODB_URI_TEST` takes precedence, otherwise `MONGODB_URI`/`MONGO_URI`). Each request/purpose needs its own unique namespaced reference. These commands simulate trusted verification records; no funds move.

## Setup, indexes and tests

No additional npm dependency, queue or payment credential is needed. Keep the existing MongoDB/JWT setup and optionally configure the bounds in `.env.example`. New collections are created on use; existing accounts/profiles require no data migration. Deploy all booking/lifecycle writers together so older instances cannot bypass the new guards. The legacy directory `starting_price` is not used as an inspection fee.

Mongoose normally creates the declared indexes during model initialisation. If deployment disables `autoIndex`, explicitly call `createIndexes()` for `ServiceRequest` and `PaymentEvent` before serving traffic. The declared indexes support participant pagination, participant payment-obligation lookup, and artisan/appointment-state/start overlap queries; mandatory `_id` uniqueness provides lock/reference arbitration. No TTL indexes are used.

Run `npm test` with a local MongoDB server or `MONGODB_URI_TEST`. New tests use the existing unique `fixly-test-<uuid>` database/guarded cleanup. They cover the HTTP journey, strict input/privacy, effective expiry without cleanup, concurrent inspection/repair scheduling, independent-connection locks, lifecycle overlaps, monetary rounding, payment replay/failure recovery, and blocked problem finalisation.

## Postman main journey

1. Register/login a `house_owner` and an `artisan`; create the artisan's professional profile. Save both Bearer tokens and artisan ID as environment variables.
2. With the homeowner token, `POST /api/v1/service-requests` using the creation example with future dates. Save `data.id` as `requestId`.
3. With the artisan token, `GET /:requestId` to see the submitted address, then `POST /:requestId/accept` with the explicit inspection fee.
4. Verify `awaiting_inspection_payment` from either participant. In a local development database, use the CLI once for `inspection`. Reload: `inspection_confirmed`.
5. After the inspection window ends, artisan calls `POST /:requestId/inspection/complete`, then `POST /:requestId/quote` with future repair times and quote expiry.
6. Homeowner calls `POST /:requestId/quote/approve`. Observe `awaiting_repair_deposit`; attempting repair start now returns 409. Simulate the exact quoted deposit locally, then observe `repair_confirmed`.
7. Once repair start is reached, artisan calls `POST /:requestId/repair/start`, then `POST /:requestId/repair/complete`. Observe `awaiting_homeowner_confirmation`.
8. Homeowner calls `POST /:requestId/completion/confirm`, making the balance payable. Alternatively, `POST /:requestId/problems` with an explanation moves to a support-blocked state.
9. For the confirmation path only, simulate the exact balance locally. Reload: `completed`. List history through `GET /api/v1/service-requests?page=1&limit=20`.

Do not add Postman scripts calling a public paid endpoint; none exists. For quick testing, use near-future windows and configurable shorter response bounds/reservation durations in a development database. The API still enforces inspection end and repair start times; it exposes no clock-bypass endpoint.

Deferred: real payment adapters/webhooks, money movement, wallets, escrow, payouts/refunds, support/problem resolution, rescheduling, quote versions, chat, notifications, reviews, frontend and automatic recovery of abandoned locks.
