# DESIGN.md — Fixly

## Context (discovery)
- **Artifact type:** marketplace (public directory + artisan detail) + SaaS app (homeowner/artisan booking workspace) + settings/admin (account, admin console). Designed region by region on one token system.
- **Positioning:** utilitarian-with-warmth; trustworthy around home access, money and time.
- **Audience:** Nigerian homeowners booking an occasional repair; artisans (plumbers, electricians, carpenters, welders, painters, mechanics, bricklayers) checking jobs on a phone, often on site; 1–2 Fixly operators.
- **Primary action per region:** public → find an artisan and request an inspection; workspace → do the one thing this job is waiting on; admin → resolve the top queue item.
- **Adjectives:** capable, plain-spoken, exact, steady.
  - capable → sturdy semi-condensed display at heavy weight
  - plain-spoken → sentence-case labels, no decoration, one primary action per panel
  - exact → tabular figures, timezone on every time, measured tick marks
  - steady → cool neutral ground, borders not floating shadows, short quiet motion
- **Aesthetic essence:** measured · workshop · clear.
- **Single-minded proposition:** "You can always see exactly where your job stands and who acts next."
- **Archetype:** Everyman with Sage restraint.
- **References:** admire Linear (density, quiet borders), Stripe dashboard (money typography), Stanley/Tajima tape blades (tick rhythm, stamped numerals). Avoid Upwork/Fiverr card grids and the shadcn default kit.
- **Mode:** light only. **Density:** balanced on public pages; dense in workspace and admin.
- **Constraints:** React 19, Vite 8, plain JS, Tailwind v4, Radix primitives, lucide-react; WCAG 2.2 AA; 360px and up; no payment UI.

## Aesthetic
- **Direction:** Workshop modern, adjusted: ink-green structure on a cool neutral ground, one teal-green action colour, amber reserved for running clocks, red only for errors and destructive actions. No cream or paper ground.
- **Defining trait:** every booking is a measured length of work. Progress, deadlines and money splits are drawn as marks on a ruler, never as spinners or percentage rings.
- **Signature move: the tape.** A horizontal tape-measure blade: minor ticks every 4px; a major tick with a short label at each milestone (Requested · Inspection booked · Inspected · Quoted · Repair booked · Repair done · Settled); solid fill up to the current stage; an amber notch where a deadline is running. Used in:
  1. request detail header (full size)
  2. request list rows (mini, 4px tall, no labels)
  3. the landing "how a job runs" section (content that really is a sequence)
  4. the quote approval panel (the 70/30 deposit/balance split as two measured segments)
  5. a new artisan's empty queue

## Typography
- **Display and figures:** Archivo Variable (OFL, `@fontsource-variable/archivo`). Headings use `wdth` 88, `wght` 720, tracking −0.01em. Prices, dates, countdowns and table numbers use Archivo `wght` 560 with `font-variant-numeric: tabular-nums`.
- **Body/UI:** Atkinson Hyperlegible Next Variable (OFL, `@fontsource-variable/atkinson-hyperlegible-next`), weights 400/500/700. Public Sans was replaced because it is a neo-grotesque like Archivo, which the deslop pairing rule calls typographic mud.
- No monospace face; ids are never shown to users.
- **Scale:** ratio 1.25 (major third), base 16px.

| step | size | line-height | use |
|---|---|---|---|
| caption | 13px | 1.4 | meta, helper text, secondary table text |
| body | 16px | 1.55 | text, inputs, buttons |
| h3 | 20px | 1.3 | panel titles |
| h2 | 25px | 1.25 | section titles |
| h1 | 31px | 1.2 | page titles |
| display | 39px (49px on landing at ≥1024px) | 1.1 | landing and directory hero only |

- Tables and admin use 14px body text, never below 13px. Prose measure is 68ch at most.
- Headings use `text-wrap: balance`; body text uses `text-wrap: pretty`.
- No all-caps labels, no eyebrow text above headings, no coloured last word.

## Color
- **Strategy:** home repair is usually orange/yellow "construction" colours or marketplace blue. Fixly takes ink green with a teal-green action (hue 172, far from the 250–320 indigo band). Amber means a clock is running and is never decoration.
- **Distribution:** 60 cool neutral ground and surfaces / 30 ink structure (text, header band, tape ticks) / 10 teal action.
- **Palette** (role → OKLCH | approximate hex; regenerate the hex from OKLCH and verify contrast):
  - bg `oklch(0.975 0.004 215)` | #F5F8F9
  - surface `oklch(0.995 0.002 215)` | #FCFDFD (raised panels, dialogs)
  - surface-inset `oklch(0.955 0.006 215)` | #EEF2F3 (inputs, tape track)
  - fg `oklch(0.25 0.03 220)` | #142830
  - fg-2 `oklch(0.40 0.025 220)` | #36484F
  - muted `oklch(0.52 0.02 220)` | #5B6A70 (target ≥4.5:1 on bg)
  - border `oklch(0.89 0.008 215)` | #D8DEE0
  - border-strong `oklch(0.78 0.012 215)` | #B3BDC0
  - ink `oklch(0.31 0.045 205)` | #173B40 (header band, tape fill)
  - accent `oklch(0.52 0.10 172)` | #1E7A68
  - accent-hover `oklch(0.46 0.09 172)` | #136A5A
  - accent-soft `oklch(0.95 0.03 172)` | #E2F4EF
  - accent-fg `oklch(0.99 0.004 172)` | #F9FDFC
  - success `oklch(0.50 0.11 150)` | #2B7448; success-soft `oklch(0.95 0.035 150)` | #E3F4E8
  - warning `oklch(0.53 0.12 70)` | #8F5B0A (text); warning-soft `oklch(0.95 0.05 85)` | #FBF0D6; warning-mark `oklch(0.80 0.15 80)` | #E9B13A (notch only, never text)
  - error `oklch(0.52 0.17 27)` | #B33A30; error-soft `oklch(0.95 0.03 25)` | #FBE9E6
  - info `oklch(0.50 0.09 240)` | #2D6390; info-soft `oklch(0.95 0.02 240)` | #E7F0F8
- **Stage tones.** Every status badge pairs an icon with a text label; colour is never the only signal.

| tone | colour | statuses |
|---|---|---|
| waiting | info | pending, inspection_completed |
| clock | warning | awaiting_inspection_payment, quote_submitted, awaiting_repair_deposit, awaiting_final_payment |
| booked | accent | inspection_confirmed, repair_confirmed |
| working | ink | repair_in_progress, awaiting_homeowner_confirmation |
| attention | error | problem_reported |
| done | success | completed |
| ended | muted | rejected, response_expired, cancelled, inspection_payment_expired, quote_expired, repair_not_proceeding, repair_payment_expired, support_closed |

## Spacing, radius, shadow
- **Spacing:** base 4px; scale 1, 2, 3, 4, 6, 8, 12, 16 (4–64px). Use 8–12px inside a group, 24px between groups and 48–64px between page sections.
- **Radius (two values only):** `--radius-sm` 4px for controls, badges and tape ends; `--radius-md` 8px for panels and dialogs. Status chips use 4px; no pills.
- **Shadow:** defined-edge approach. Panels get a 1px border and no shadow. Only overlays (Dialog, Popover, Toast, mobile filter sheet) get the single `--shadow-overlay`, and overlays have no border. Never both on one element.

## Layout and composition
- **Grid:** 12 columns. Gutters 16px on mobile, 24px from 1024px. Page margin 16px on mobile, 32px on tablet. Max width 1200px (admin 1360px).
- **Public:** left-aligned editorial header, no centred hero. The directory has a 280px sticky filter rail beside a results list of full-width rows, not a card grid. Each row shows avatar, name with profession, areas, rating with its count and a right-aligned "From ₦". Below 1024px the filters move into a Radix Dialog sheet.
- **Workspace:** a top bar on an `ink` band with no sidebar (only 3–4 sections).
- **Signature layout move:** the request queue is grouped by whose turn it is: "Needs you", "Waiting on the other side", "Finished". Within each group, rows are sorted by nearest deadline.
- **Request detail:** the tape spans the full width. Below it at desktop, an 8/4 split:
  - left: the current-stage panel with one primary action, then history and notes
  - right: a facts rail (who, where, when, money)
  - on mobile the facts rail collapses below the action panel
- **Admin:** dense tables with 40px rows. At ≥1280px queues sit left with detail in a side panel; below that, detail gets its own route.
- **Responsive:** mobile-first, breakpoints 640 / 1024 / 1280.

## Components and states
- Every interactive component covers default, hover, active (`scale(0.98)`), focus-visible, disabled and loading, plus error and selected where relevant.
- **Buttons** are ranked by importance, not coloured by meaning:
  - primary: accent fill
  - secondary: surface with border-strong
  - tertiary: text, underline on hover
  - destructive: error fill, only inside confirmation dialogs

  Height 44px (36px in admin tables). While loading, the label switches to its "-ing…" form with an inline spinner and the width stays fixed. A button stays enabled until the request starts.
- **Inputs:**
  - visible label above, helper below, error below in error colour with an icon
  - validate on blur and on submit; keep the user's input after an error and focus the first invalid field
  - `surface-inset` fill; border-strong turns accent on focus
  - correct `type`, `autocomplete` and `inputmode`
- **MoneyInput:** whole naira with a ₦ prefix and `inputmode="numeric"`. Shows the formatted figure ("₦2,500.00") and sends kobo (×100).
- **DateTimeInput:** native `datetime-local` plus a visible zone label (e.g. "WAT, UTC+01:00"). Sends ISO 8601 with the local offset.
- **Tables:** text left-aligned, numbers right-aligned in tabular Archivo, 1px border separators, no zebra striping.
- **Overlays:** Radix Dialog/AlertDialog trap focus and return it to the trigger. Every destructive action uses an AlertDialog that names the target. Hard delete also requires typing the account email.
- **Empty, loading, error and conflict states:**
  - empty: one plain sentence and one action
  - loading: skeletons shaped like the real content; no full-page spinner after first paint
  - error: what happened, what to do, and Retry
  - conflict (409): an inline notice in the action panel after an automatic refetch: "This job changed while you were looking — here's the latest."
- **Focus ring:** `box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)` plus `outline: 2px solid transparent` so it still shows in forced-colors mode.

## Motion
- Durations: instant 100ms / fast 150ms / normal 200ms / slow 300ms.
- Easings: `--ease-out` cubic-bezier(0.23,1,0.32,1); `--ease-in-out` cubic-bezier(0.77,0,0.175,1); `--ease-exit` cubic-bezier(0.4,0,1,1).
- Animate only `transform` and `opacity`; never use `transition: all`.
  - popovers scale from 0.96 with transform-origin at the trigger
  - dialogs fade and scale from 0.98, centred
  - toasts slide 8px
- **Signature motion:** when the stage changes, the tape fill extends with `scaleX` over 300ms with ease-out. It runs once per change, never on load.
- **Reduced motion:** the fill and overlays swap with a 100ms opacity change and nothing moves. Countdowns tick once a minute with no animation.

## Iconography
- lucide-react on a 24px grid with `strokeWidth={1.75}` and round caps; 20px inline, 16px in tables.
- **Profession glyphs:**
  - Plumber `wrench`
  - Electrician `plug-zap`
  - Carpenter `hammer`
  - Painter `paint-roller`
  - Welder `flame`
  - Brick Layer `brick-wall`
  - Auto Mechanic `car`
  - Others `tool-case` (fall back to `toolbox` if the installed lucide lacks it)
- Decorative icons get `aria-hidden`; icon-only buttons get an `aria-label`. No emoji.

## Imagery and illustration
- Real product visuals and avatars only. The landing hero is a live request panel with the tape, built from the real components and labelled as sample data. No stock photos, illustrations or blobs.
- **Avatars:**
  - source: `avatar.url`, otherwise `/avatars/{role}.svg`, falling back to `house_owner`
  - a missing participant shows the role default and "Former Fixly user"
  - circles at 32/40/64px with explicit width and height and a 1px inset outline at `rgba(0,0,0,.1)`
- The tape's tick rhythm is the only graphic device.

## Dark mode
- Out of scope for release 1. Tokens are semantic so it can be added later. Set `color-scheme: light` and a `theme-color` meta tag of bg.

## Accessibility
- AA contrast verified for every text/background token pair on the specimen route.
- Visible, managed focus. A skip link is the first focusable element, and route changes move focus to the page h1.
- Full keyboard operability. Targets are 44px, never below 24px.
- Status is never conveyed by colour alone.
- Toasts and form errors use `aria-live="polite"`. Countdown regions use `aria-live="off"` with a static text equivalent.
- Respect `prefers-reduced-motion`; layouts survive 200% zoom.

## Tokens (source of truth)
Adapter: Tailwind v4 `@theme` in `frontend/src/styles/tokens.css`.

```css
@import "tailwindcss";
@theme {
  --font-display: "Archivo Variable", "Arial Narrow", sans-serif;
  --font-body: "Atkinson Hyperlegible Next Variable", "Segoe UI", sans-serif;
  --text-caption: 0.8125rem; --text-caption--line-height: 1.4;
  --text-body: 1rem; --text-body--line-height: 1.55;
  --text-h3: 1.25rem; --text-h3--line-height: 1.3;
  --text-h2: 1.5625rem; --text-h2--line-height: 1.25;
  --text-h1: 1.9375rem; --text-h1--line-height: 1.2;
  --text-display: 2.4375rem; --text-display--line-height: 1.1;
  --spacing: 0.25rem;
  --radius-sm: 4px; --radius-md: 8px;
  --shadow-overlay: 0 12px 32px -8px oklch(0.25 0.03 220 / 0.22), 0 2px 6px oklch(0.25 0.03 220 / 0.10);
  --color-bg: oklch(0.975 0.004 215);
  --color-surface: oklch(0.995 0.002 215);
  --color-surface-inset: oklch(0.955 0.006 215);
  --color-fg: oklch(0.25 0.03 220);
  --color-fg-2: oklch(0.40 0.025 220);
  --color-muted: oklch(0.52 0.02 220);
  --color-border: oklch(0.89 0.008 215);
  --color-border-strong: oklch(0.78 0.012 215);
  --color-ink: oklch(0.31 0.045 205);
  --color-accent: oklch(0.52 0.10 172);
  --color-accent-hover: oklch(0.46 0.09 172);
  --color-accent-soft: oklch(0.95 0.03 172);
  --color-accent-fg: oklch(0.99 0.004 172);
  --color-success: oklch(0.50 0.11 150); --color-success-soft: oklch(0.95 0.035 150);
  --color-warning: oklch(0.53 0.12 70); --color-warning-soft: oklch(0.95 0.05 85);
  --color-warning-mark: oklch(0.80 0.15 80);
  --color-error: oklch(0.52 0.17 27); --color-error-soft: oklch(0.95 0.03 25);
  --color-info: oklch(0.50 0.09 240); --color-info-soft: oklch(0.95 0.02 240);
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --duration-instant: 100ms; --duration-fast: 150ms; --duration-normal: 200ms; --duration-slow: 300ms;
  --breakpoint-sm: 40rem; --breakpoint-lg: 64rem; --breakpoint-xl: 80rem;
}
```

Components use only semantic utilities (`bg-surface`, `text-muted`, `rounded-md`). Raw hex values and Tailwind palette classes (`gray-200` and the like) are banned and checked by grep.

## Cards and surfaces
- A panel is `bg-surface`, a 1px border, `rounded-md` and 16px padding (24px at ≥1024px). Never nest panels; group inside one with spacing and 1px dividers.

## Copy voice
- Second person, sentence case, active verbs. A button names its outcome and the toast echoes it ("Send quote" → "Quote sent").
- Errors say what happened and the next step, without apologising.
- Times always carry their zone. Money always shows ₦ with two decimals.
- **Banned:**
  - words: Elevate, Unlock, Supercharge, Seamless, Empower, Streamline, Leverage, all-in-one, journey, effortless, hassle-free
  - trust claims: "verified professional", "trusted", "top-rated" (unless `ratingSummary.count` ≥ 1)
  - patterns: "Good morning, {name}", "not just X — it's Y", "→" appended to labels, middot strings ("A · B · C"), eyebrow labels, invented statistics
- Email verification is never presented as identity verification.

## Slop audit
- **Status:** pending (filled after build). Will record the slop-checklist score, the swap, squint, signature and token tests, and the accessibility gate result.

## Changelog
- 2026-11-23: initial system. Workshop modern on a cool neutral ground (cream removed per anti-slop rules); Archivo + Atkinson Hyperlegible Next (Public Sans failed the pairing rule); tape signature.
