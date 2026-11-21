# Automated API scenario testing

This suite starts real backend processes on localhost and exercises their HTTP endpoints without a frontend, Postman setup, or manually copied tokens. All ordinary users, logins, artisan profiles, bookings, and workflow transitions are created through the API.

## Run locally

Use Node.js 22, installed backend dependencies, and a running local MongoDB listener. From `backend/`:

```sh
npm ci
npm test
npm run test:api
npm run test:api:journeys
```

Or run both HTTP tiers together, enforcing positive and denied coverage for every service-request route:

```sh
npm run test:api:all
```

| Command | Purpose | Time budget |
| --- | --- | --- |
| `npm test` | Existing deterministic regressions plus harness/report safety tests | Usually seconds; depends on local MongoDB |
| `npm run test:api` | Fast actual-HTTP scenarios, privacy, validation, payments, concurrency, lifecycle restrictions, rate limits | Typically 15–30 seconds; 90-second overall limit |
| `npm run test:api:journeys` | Complete booking journeys with real inspection/repair/expiry time gates | Approximately 2–3 minutes; 4-minute overall limit |
| `npm run test:api:all` | Fast scenarios and complete journeys in one isolated run | Approximately 3–4 minutes; 6-minute overall limit |
| `npm run test:api:defaults` | Optional full journey with the normal 15-minute response minimum | Approximately 16 minutes; 22-minute overall limit |

The runner uses `mongodb://127.0.0.1:27017` by default. To select another local listener:

```sh
FIXLY_SCENARIO_MONGO_URI=mongodb://127.0.0.1:27018 npm run test:api:all
```

Only literal loopback hosts (`127.0.0.1` or `[::1]`) and an optional port are accepted. Remote/SRV targets, credentials, database paths, options, and multi-host URIs are refused. The harness ignores inherited application database URLs and refuses to run when the parent has `NODE_ENV=production`. It creates its own development server environment; you do not need to edit `.env` or start the API yourself.

## Isolation and cleanup

Each run generates a unique `fixly-test-<uuid>` database, a private ownership marker, random credentials, and a random JWT secret. A temporary empty child working directory prevents accidental loading of the project's `.env`. Cloudinary credentials are blank and the API process has payment simulation disabled.

Servers bind to `127.0.0.1` on OS-selected ports. Readiness arrives over private IPC only after database/index initialization and HTTP listen; the harness confirms the welcome route using real HTTP. Client requests are restricted to these exact owned origins, use a bounded 30-second HTTP deadline, and reject redirects. Per-request timing and timeout metadata appear in reports; failed mutations are not automatically retried.

Normal completion, failed assertions, and handled SIGINT/SIGTERM stop the owned child processes before removing the run-owned database. Cleanup verifies both its exact generated name and its ownership token. There is no bulk database deletion or process-name/port-based killing. Concurrent runs have independent databases, ports, credentials, and secrets.

Do not forcibly kill the runner with SIGKILL or power off the machine if you expect automatic cleanup: no process can execute teardown after that. Any uncertain cleanup fails the run and identifies the generated database for manual investigation. Verify the owning processes have stopped before manually removing a leftover test database. Ordinary application databases must never be supplied to this harness.

## Covered scenarios

Fast checks (`F01`–`F15`, plus explicit concurrency/lock/payment variants) cover:

- Registration, real login JWTs, professional-profile creation, forbidden public admin registration, and wrong-password rejection.
- Service-request creation, detail/list ownership, pagination, and public-directory privacy.
- Missing/malformed authentication for all 16 service-request routes; wrong assigned participants and unrelated users/admins cannot act on requests.
- Spoofed ownership/status/payment fields, invalid dates/windows/deadlines/amounts/currencies/ids, and malformed pagination.
- Pending clarification notes and immutable original request details.
- Rejection, cancellation, reservation release, inspection-fee snapshots, and early/invalid-stage actions.
- Private verified-payment handling, amount/currency/purpose checks, duplicate replay, concurrent cross-request reference reuse, and cancelled-payment reconciliation.
- Two API processes competing for an artisan's overlapping schedule, adjacent appointments, independent artisans, and an exact-token lock fixture.
- Account deletion/role-change restrictions while obligations remain and separate server instances proving authentication/API rate limits.

Real-time journeys (`J01`–`J09`) cover:

- Complete inspection, immutable quote, verified 70% deposit, repair start/completion, homeowner confirmation, and final balance.
- Completed-job homeowner review, immutable repeat rejection, public rating aggregate and completed-status history filtering.
- Quote decline and unpaid repair cancellation while preserving paid inspection history.
- Homeowner problem reporting and restrictions on normal finalization, payment, cancellation, and account deletion.
- Response deadlines, inspection reservation expiry, quote expiry, and repair reservation expiry.
- Reuse of an expired future slot and protection of replacement bookings against late payment events.
- Cross-process repair approval conflicts, including inspection-versus-repair availability.
- Permanent deletion after settlement, preserved historical participant IDs, and a fresh account that cannot inherit the previous account's history.

Scenarios verify HTTP status and response contracts and then re-read state. Concurrency tests assert exactly one winner without assuming which request wins. The combined command fails if a service-request route lacks a successful HTTP call or an access-denied call. Exact deadline equality, controlled database failures, and lost acknowledgements remain covered by the existing deterministic `npm test` suite. They are not simulated by adding public fault-injection endpoints.

## Real time and supported configuration

The fast/configured journey server uses the existing supported settings `REQUEST_RESPONSE_MIN_MINUTES=1` and `INSPECTION_PAYMENT_MINUTES=1`. Other business guards, password hashing strength, authentication, validation, and database time predicates remain intact. High-volume cases raise existing configurable rate-limit maxima only on their isolated server; separate limited servers exercise real 429 responses.

Actors are provisioned before appointment clocks start. Independent journeys share inspection and repair wait windows, and bounded polling observes real elapsed time. The suite does not mock `Date`, modify system clocks, overwrite booking timestamps/statuses, or add a test-time API bypass.

The defaults tier leaves response and reservation timing at application defaults and executes a full happy path. Its 15-minute inspection lead time is deliberate. It is optional locally and runs on the scheduled CI job or by workflow dispatch with `include_defaults` enabled.

## Trusted fixture and payment boundaries

Public admin registration is forbidden. The harness therefore registers one disposable ordinary account through HTTP, checks run ownership, promotes that exact account in the isolated database as trusted operator provisioning, then logs in normally. It can also hold a run-owned account's exact-token lock for one explicitly labeled concurrency scenario. Other business progression uses HTTP.

A private development-only payment helper verifies database ownership before each event and calls the existing guarded internal `applyVerifiedPayment` boundary. The API itself exposes no `pay` or `mark-paid` route. Payment-driver errors are internal service results, not HTTP payment responses.

These checks verify payment-related application behavior using synthetic events. They do not charge money or verify a payment provider's signatures, webhook transport, checkout, settlement, refunds, or payouts. Those need provider-adapter tests when that integration exists.

Read-only database checks are limited to evidence HTTP does not expose, including payment receipt counts and leftover lifecycle locks. Inspection, repair, quote, and completion stages are not seeded directly to speed up journeys.

## Reports and CI

Each run writes a private-permission JSON report to:

```text
backend/artifacts/api-scenarios/<run-id>-<tier>.json
```

Reports contain scenario outcomes/durations, safe state/status differences, redacted method/path/status traces, route coverage, process-exit metadata, and cleanup results. Request IDs are normalized in trace paths; query strings, passwords, JWTs, Authorization headers, raw response bodies, payment references, ownership tokens, and database credentials are omitted. Arbitrary error messages and raw child logs are not persisted because they may contain secrets. Safe stack call sites help locate failures.

The runner prints each scenario's progress and exits nonzero on assertions, startup/health problems, timeouts, incomplete combined route coverage, failed cleanup, or failed report writing. Generated artifacts are ignored by Git.

`.github/workflows/backend-api-scenarios.yml` runs the existing regression suite and combined actual-HTTP suite on relevant pull requests/pushes, using a disposable MongoDB service with no production/provider secrets. The weekly/manual optional run adds the default-timing journey. Redacted JSON reports are retained as CI artifacts for seven days. The workflow is prepared in the repository; local validation does not mean a hosted CI run has executed.


## Initial verified results

Route B verification: **225/225 regression tests** and **29/29 configured HTTP scenarios** pass. The combined HTTP run completed in 155 seconds, covered success and access denial on all **16** service-request routes (including reviews), and completed cleanup. Credential tests mock SMTP; no Mailtrap credentials or live email were used.

The implemented suite passed 188 regression/safety/report tests, 19 fast real-HTTP scenarios, and all 10 configured journey scenarios. The combined run passed all 29 scenarios in 222 seconds on the development machine under load, with positive and access-denied coverage for all 15 service-request routes. Its six owned helper/server processes exited successfully and cleanup completed. Runtime varies with CPU and MongoDB load; the budgets above are enforced independently of application workflow deadlines.
