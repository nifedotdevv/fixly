# Fixly frontend

The web app for Fixly, where homeowners find artisans, request repairs, and follow a job from first request to review. Artisans use it to manage their profile and quote jobs. Admins use it to manage users and work the support queues. It is a React 19 single-page app built with Vite, Tailwind v4, React Router and React Query, and it talks to the Express API in `backend/`.

## Running it

1. Start the backend on port 5000 (see the root README). From `backend/`, run `npm run dev`.
2. From `frontend/`, run `npm install` once, then `npm run dev`.
3. Open the URL Vite prints.

Vite proxies every `/api` request to `http://localhost:5000`, so the browser never makes a cross-origin call in development. No `.env` file is needed.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` writes a production build to `dist/`.
- `npm test` runs the Vitest suite once (jsdom, Testing Library).
- `npm run lint` runs ESLint.

## Folder map

- `src/lib` holds the API client, session storage, money and time formatters, request status logic and the countdown hook.
- `src/auth` holds the auth provider, role guards, role normalising and the dashboard redirect.
- `src/layouts` holds the public, app and admin layouts, the shell and nav, the verify-email banner and the skip link.
- `src/components/ui` holds the shared controls: buttons, fields, dialogs, toasts, badges, pagination and states.
- `src/components/tape` holds the tape, the progress strip that shows where a job stands and its deadline.
- `src/pages/landing`, `auth`, `account`, `artisans`, `workspace`, `requests`, `admin` hold the pages for each area. `requests` also holds the action forms and status panels, and `admin` splits into `users` and `support`.
- `src/styles` holds the design tokens and global CSS. `src/dev/Specimen.jsx` is a dev-only component sheet at `/dev/specimen`.

## Design notes

Colours, type, radii, motion and copy voice are defined in [`/DESIGN.md`](../DESIGN.md) at the repo root. Read it before adding UI. Use the tokens in `src/styles` rather than raw colours, keep icons at `strokeWidth={1.75}`, and write button labels in sentence case.

## Conventions

- **Money.** Booking amounts are in kobo and go through `formatMoney` in `lib/money.js`. The one exception is an artisan's `starting_price`, which is whole naira and goes through `formatNaira`. Never build a `₦` string by hand.
- **Times.** The API sends ISO timestamps. The app shows them in the browser's time zone and always labels the zone, using `lib/time.js`. Date-time inputs are converted to an ISO string with an offset before they are sent.
- **Session.** The JWT lives in `sessionStorage`, so closing the tab ends the session. The API client sends it as a Bearer token. A 401 on an authenticated request clears the session and sends the user to `/login` with the page they were on, so they return there after signing in.
- **Credential tokens.** Reset, verify-email and confirm-email-change links carry the token in the URL fragment. The pages read it from there, then clear it from the address bar. Tokens never appear in a query string.
- **No payment UI.** There is no online checkout. When a job needs payment, the request page shows a payment-waiting panel that says what is pending and until when.
- **No messaging.** Homeowners and artisans do not chat in the app.

## Routes

Public, any visitor:

- `/` landing
- `/artisans` directory
- `/artisans/:profileId` artisan detail
- `/reactivate`, `/forgot-password`, `/reset-password`, `/verify-email`, `/confirm-email-change`
- `/login` and `/register`, which redirect signed-in users away
- `*` not found

Signed in, any role:

- `/dashboard` redirects by role
- `/account`

Signed in, role-guarded (the wrong role sees a "wrong role" page):

- `/artisans/:profileId/request` for homeowners
- `/requests` and `/requests/:id` for homeowners and artisans
- `/workspace/profile` for artisans
- `/admin/users`, `/admin/users/:id`, `/admin/support/problems`, `/admin/support/problems/:id`, `/admin/support/payments` for admins

## Known gaps

- No online payment. Payments are recorded outside the app and admins reconcile them in the payments queue.
- The admin user page cannot say why an account was deactivated, because the API does not return `deletionReason`. It shows "Deactivated" only.
- The admin users list has no search.
