# DESIGN.md — Fixly

## Context (discovery)
- **Artifact type:** marketplace (public landing, directory, artisan detail) + SaaS app (homeowner/artisan booking workspace) + settings/admin (account, admin console). Designed region by region on one token system.
- **Positioning:** utilitarian-with-warmth; trustworthy around home access, money and time.
- **Audience:** Nigerian homeowners booking an occasional repair; artisans (plumbers, electricians, carpenters, welders, painters, mechanics, bricklayers) checking jobs on a phone, often on site; 1–2 Fixly operators.
- **Primary action per region:** public → find an artisan and request an inspection; workspace → do the one thing this job is waiting on; admin → resolve the top queue item.
- **Adjectives:** capable, plain-spoken, exact, bright.
  - capable → large, tightly tracked medium-weight display type
  - plain-spoken → sentence-case labels, no decoration, one primary action per panel
  - exact → tabular figures, timezone on every time, ₦ with two decimals
  - bright → white panels on a warm near-white ground, a navy-to-lime-to-lemon gradient on public sections
- **Aesthetic essence:** open · bright · exact. Calendly-structured SaaS: the public site and the signed-in app share one shell vocabulary (sidebar, panels, rows).
- **Single-minded proposition:** "You can always see exactly where your job stands and who acts next."
- **Archetype:** Everyman with Sage restraint.
- **References:** calendly.com for structure and style (see `docs/reference-calendly.md`): section rhythm, radii, type scale and weights, navy text and buttons, slate body text, saturated gradient hero and media squares, tab carousel, card accordion, scroll-linked list. Our brand colours (lemon, lime) replace its blue. Stripe dashboard for money typography. We never copy a reference's logo, illustrations, copy, product names or proprietary fonts.
- **Mode:** light and dark (follows the OS; user override). **Density:** open on public pages; balanced to dense in workspace and admin.
- **Constraints:** React 19, Vite 8, plain JS, Tailwind v4, Radix primitives, lucide-react; WCAG 2.2 AA; 360px and up; no payment UI.

## Aesthetic
- **Direction:** Calendly-style SaaS in navy + lemon + lime + white. A warm near-white page ground, pure white cards and panels, very large radii on public pages, medium-weight (500) tightly tracked headlines in navy over slate body text. Navy (ink) carries all text and every filled button. The brights live in gradients (hero, media squares, card frames) and in state: lime marks the current place, lemon the current stage and booked tone.
- **Defining trait:** separation by tone and radius, not by lines and shadows on public pages; in the app, white panels with a 1px border on the page ground.
- **Signature:** the hero gradient (navy at the top through teal and green to lime and lemon at the bottom) with light text on its dark half, and the solid wrench logo. Lime is the active sidebar item, bottom-tab pill, active tab count, selected rows, icon chips and the active landing tab ring. Lemon is the current stage marker, the booked tone and the end stop of every gradient. Neither is ever text or the only edge of a control.
- **The tape is retired.** The tape-measure blade (stage progress, mini row bar, 70/30 split) is removed everywhere. Replaced by:
  - `StageSteps`: seven stage markers joined by a line (done = ink with a check, current = lemon with an ink ring, upcoming = outlined). A row of seven segments below 640px and in list rows.
  - `SplitBar`: two rounded segments (deposit in ink, balance in border-strong) with their ₦ labels.

## Typography
- **Everything:** Geist Variable (OFL, `@fontsource-variable/geist`) for display, headings, UI and body, as a stand-in for the reference's proprietary sans. Headings and display are weight 450 (Geist reads heavier than the reference's face at 500); UI labels 500, active nav and tab labels 600; body 400. Prices, dates and table numbers use `.tabular` (tabular-nums).
- **Serif accent:** Newsreader Variable (OFL, `@fontsource-variable/newsreader/opsz.css`), weight 400, −0.03em, via `.heading-serif`, on the split-section H2s of the landing (scroll list, "What Fixly does not do yet") and the H2 of each hero feature-tab panel (30px from 640px, 28px below).
- No monospace face; ids are never shown to users.
- **Feel:** large contrast between headline and body. Headlines are medium weight, tight (−0.02 to −0.042em) and set at line-height 1.1. Body is 16px at line-height 1.4 in slate (`muted`).

**App scale** (workspace, admin, forms):

| step | size | line-height | use |
|---|---|---|---|
| caption | 13px | 1.4 | meta, helper text, fine print (minimum size) |
| small | 14px | 1.4 | nav links, card descriptions, checklists, tables |
| body | 16px | 1.4 | text, inputs, large buttons |
| lead | 18px | 1.4 | section intros on public pages |
| h3 | 20px | 1.4 | panel titles, accordion item titles |
| h2 | 24px | 1.25 | section titles in the app |
| title | 24px | 1.2 | small public headings |
| h1 | 32px | 1.15 | page titles in the app (−0.03em) |

**Display scale** (public pages; line-height 1.1):

| step | size | tracking | use | below 640px | 640–1023px |
|---|---|---|---|---|---|
| display-xs | 30px | −0.02em | feature card heading | h2 (25px) | h2 (25px) |
| display | 36px | −0.025em | mobile hero | — | — |
| display-md | 40px | −0.03em | split-section H2 | title (28px) | display-xs |
| display-lg | 48px | −0.03em | centred section H2 | display-xs | display-md |
| display-xl | 64px | −0.03em | hero H1 | display (40px) | display-md (48px) |

- Tables and admin use 14px body text, never below 13px. Prose measure is 68ch at most; lead paragraphs max 560px.
- Headings use `text-wrap: balance`; body text uses `text-wrap: pretty`.
- No all-caps labels, no eyebrow text above headings, no coloured last word.

## Color
- **Strategy:** navy + lemon + lime + white. Navy text and buttons as on the reference; lemon and lime replace its blue. Lemon has almost no contrast with white (1.2:1), so both brights are restricted to fills and gradients that carry navy text, or that sit under light text only on their dark (navy/teal) part.
- **Distribution:** 60 near-white ground and white surfaces / 25 navy (text, buttons, stage markers, footer band, hero top) / 15 lemon and lime (gradients, chips, active states).
- **Palette** (role → OKLCH | hex computed from the OKLCH value):
  - bg `oklch(0.985 0.004 100)` | #FBFAF7 (page ground)
  - surface `oklch(1 0 0)` | #FFFFFF (cards, inputs, dialogs)
  - surface-2 `oklch(0.97 0.006 100)` | #F6F5F1 (media panels, inactive fills, section containers; replaces `surface-inset`)
  - fg `rgb(7 26 49)` | #071A31 (navy: headings and text)
  - fg-2 `rgb(61 70 78)` | #3D464E
  - muted `rgb(95 109 119)` | #5F6D77 (slate: body copy, summaries, descriptions)
  - border `rgb(7 26 49 / 0.1)` (panel edges, hairlines)
  - divider `rgb(216 220 224)` | #D8DCE0 (list separators)
  - border-strong `rgb(134 144 153)` | #869099 (input boundaries, 3:1 on every ground)
  - ink `rgb(7 26 49)` | #071A31 (filled buttons, stage markers, footer band); ink-hover `rgb(22 48 80)`
  - tint `rgb(7 26 49 / 0.05)` (hover fill for nav items, menu items, secondary buttons)
  - on-ink `rgb(252 251 248)` | #FCFBF8 (text on ink, on the hero and on error fills)
  - accent `oklch(0.93 0.17 105)` | #F9ED52 (lemon; fills only)
  - accent-hover `oklch(0.89 0.17 100)` | #F5DC3A (also the link underline)
  - accent-soft `oklch(0.975 0.05 105)` | #FBF9D3 (chips, selected rows, active nav link, hero mesh base)
  - accent-fg `var(--color-ink)` (text on lemon is always ink)
  - lime `oklch(0.90 0.19 128)` (fills only: active tab bar and count badge, sidebar start bar, bottom-tab pill, selected-row bar, second mesh stop)
  - lime-soft `oklch(0.965 0.06 128)` (active sidebar item, selected rows, inactive tab count badge, active account-section anchor)
  - success `oklch(0.47 0.09 165)`; success-soft `oklch(0.955 0.035 165)`. Re-hued from 150 to 165 so success-soft cannot be confused with lime-soft; chroma 0.09 keeps it inside sRGB.
  - warning `oklch(0.50 0.13 50)` | #9B4805; warning-soft `oklch(0.955 0.035 55)` | #FFEBDA. Re-hued from amber (70–85) to orange (50–55) because amber-soft was indistinguishable from lemon-soft.
  - error `oklch(0.50 0.17 27)` | #B02B27; error-soft `oklch(0.955 0.03 25)` | #FFE9E6
  - info `oklch(0.48 0.09 240)` | #24648B; info-soft `oklch(0.955 0.02 240)` | #E5F2FD
- **Rules for lemon:**
  - A fill colour, never a text colour and never the only boundary of a control on a light ground.
  - Buttons are never lemon by default: primary is navy fill, secondary is a 1px navy outline (as on the reference). The `lemon` variant exists but is unused.
  - Text links: navy text, 1px navy underline at offset 4px, 2px on hover (`.link`).
  - Landing carousel tab: the active tab is an on-ink tile with a 3px lime ring and `aria-selected`; inactive tabs are translucent on the gradient.
  - Focus ring: 2px ink outline with a 2px offset. On an ink band use `.focus-on-ink` (on-ink outline). Tabs use an inset ring so the scroll container does not clip it.
- **Roles of the two brights:** lemon = "do something" (primary button, current stage marker, main mesh stop, link underline, booked tone). Lime = "you are here" (active item and selected state in the app).
- **Rules for lime:**
  - A fill, never a text colour and never the only boundary of a control. Ink text on it.
  - Active sidebar item: `lime-soft` fill (10px radius), semibold text and a heavier icon stroke.
  - Active bottom-tab item: a `lime-soft` pill behind the icon, semibold label.
  - Active tab: a 2px navy underline and semibold text; the count badge is `tint`, `lime` on the active tab.
  - Selected `DataRow`: `lime-soft` fill plus a 3px lime start bar, with `aria-current`.
  - Active account-section anchor: `lime-soft` plus the 3px start bar, as in the sidebar.
  - Every lime state also changes weight or carries `aria-current`/`aria-selected`, so it is not colour-only.
- **Gradients** (`pages/landing/landing.css`):
  - `.hero-gradient`: a vertical OKLCH gradient from navy through teal and green to lime and lemon, with navy radials at the top. Text on it is `on-ink` and sits only over the dark upper half. Used on the landing hero and the auth preview column.
  - `.soft-gradient`: `surface-2` with lime and lemon glows at the bottom; navy text. Stage-card section and closing call to action.
  - `.media-lime`, `.media-lemon`, `.media-teal`, `.media-soft`: saturated squares behind product mocks and as frames around the audience cards.
- **Stage tones.** Every status badge pairs an icon with a text label; colour is never the only signal.

| tone | colour | statuses |
|---|---|---|
| waiting | info on info-soft | pending, inspection_completed |
| clock | warning on warning-soft | awaiting_inspection_payment, quote_submitted, awaiting_repair_deposit, awaiting_final_payment |
| booked | fg on accent-soft | inspection_confirmed, repair_confirmed |
| working | fg on surface-2 | repair_in_progress, awaiting_homeowner_confirmation |
| attention | error on error-soft | problem_reported |
| done | success on success-soft | completed |
| ended | muted on surface-2 | rejected, response_expired, cancelled, inspection_payment_expired, quote_expired, repair_not_proceeding, repair_payment_expired, support_closed |

## Spacing, radius, shadow
- **Spacing:** base 4px. Inside a group 8–12px; between groups 24px; app page sections 48–64px. Public sections use `padding: 120px 0` at ≥1024px and `48px 0` below (measured on the reference).
- **Radius scale** (measured on the reference, then mapped to roles):

| token | value | use |
|---|---|---|
| `--radius-sm` | 8px | badges, chips, icon buttons, menu items, compact buttons |
| `--radius-md` | 16px | buttons, inputs, app panels, dialogs |
| `--radius-lg` | 20px | large buttons, media panels inside cards, icon tabs |
| `--radius-xl` | 32px | public cards and section containers below 1024px |
| `--radius-2xl` | 48px | public cards at ≥1024px |
| `--radius-3xl` | 64px | hero and section containers at ≥1024px |
| `--radius-4xl` | 80px | sticky media square in the scroll list |

  App panels use `--radius-lg` (20px). `rounded-full` is for avatars, stage markers, bar segments, count chips, the sidebar main action and round icon buttons.
- **Shadow:** soft and navy-tinted. `--shadow-card` (app panels, together with a 10% navy hairline border), `--shadow-raised` (`0 20px 48px -12px` navy at 16%: the feature card, mocks, the expanded accordion card), `--shadow-overlay` (dialogs, menus, toasts) and `--shadow-nav` (sticky nav once scrolled).

## Layout and composition
- **Container:** public content max-width 1200px, centred, side padding 16px (32px from 640px). The hero, the stage-card section and the closing section are rounded containers inset 8px (24px from 640px) from the viewport instead. App content max 1120px (admin 1280px) inside the shell.
- **Public top nav:** sticky, page-ground colour, 68px tall (64px below 640px), no border; `--shadow-nav` fades in over 200ms once the page scrolls. Wordmark left, 14px medium links, buttons right (48px tall on public pages). The inner row is full width with 48px side padding at ≥1024px. Below 640px the public links collapse into a menu button.
- **Footer (public layout):** ink band with on-ink text, 3 columns at ≥1024px: the Fixly description, Product links, and (signed out only) For artisans links, then a copyright line.
- **Public landing section patterns:**
  1. **Hero:** inset mesh container; centred H1 (two lines max), 18px subhead (max 560px), two large buttons side by side (ink + secondary, icon + label), one fine-print sentence, then an icon tab row with previous/next buttons.
  2. **Feature card (tab panel):** white, 920px max, overlaps the bottom of the hero. It is a DOM sibling of the hero, pulled up with a negative margin. Two columns: icon chip + label, heading, muted body and one text link; a `surface-2` media panel on the right.
  3. **Centred header + stage cards:** H2 alone (no eyebrow), muted lead, one ink button; a row of four white cards where one is expanded wider (flex-grow) with a checklist and a small mock. 2×2 with no accordion at 640–1023px; stacked below.
  4. **Scroll-linked list + sticky media:** icon chip + label, H2, a divider-separated list whose active item follows the scroll; a large `accent-soft` media panel stays sticky (`top: 164px`) and cross-fades per item. Below 1024px the media sits inline under the active item.
  5. **Plain two-column list** for "What Fixly does not do yet".
  6. **Audiences:** centred H2 "Built for both sides of the job" over two white cards, "For homeowners" and "For artisans". Each has an icon chip + label, an H3, one muted sentence, a check list and one text link to sign up.
  7. **Closing call to action:** inset mesh container, centred H2, two large buttons.

  Mocks: the feature-tab media and the auth preview use `AppWindow` (a framed mock of the app with a narrow icon rail and a lime active item). Each stage card holds a `MiniMock` (the compact form when collapsed). All mocks are `aria-hidden` and captioned "Sample data".
- **Other pages:**
  - Directory (`/artisans`): a `PageHeader` with the result count, a 280px sticky "Filters" `Panel` beside a `Panel flush` of `DataRow`s (not a card grid). Below 1024px the filters move into a Radix Dialog sheet opened from a "Filters (n)" button. Prices show "From ₦15,000.00" (two decimals).
  - Artisan detail (`/artisans/:id`): a back link, a header `Panel` (avatar, name, profession, areas, rating, "Request an inspection"), then an 8/4 split. Left: About (headline, years), Skills and Reviews panels. Right: a sticky Facts panel (price, works in, availability).
  - `/artisans` and `/artisans/:id` use `AdaptiveLayout`: the app shell when signed in, `PublicLayout` (with `padded`) when signed out.
  - Auth: `AuthFrame` is a full-page half-and-half split with no top bar and no footer (`PublicLayout` drops both on the auth paths). The left half holds the Fixly wordmark (linking home) at the top and the unboxed form (400px max), centred vertically from 1024px. From 1024px the right half is `hero-gradient`, pinned to the full viewport height (sticky, so the long Register form scrolls past it), with one display line and one lead line over the dark top. It is decorative and `aria-hidden`. Below 1024px only the form half shows. Each form links to the other page. Used by Login, Register, ForgotPassword, ResetPassword and Reactivate.
  - Account: `PageHeader`, then from 1024px a 12rem sticky section nav (lime active anchor) beside one `Panel` per section (Profile, Photo, Email, Password, Sessions, Delete account), each with a footer save row. Below 1024px the nav becomes a "Jump to section" `Select`.
- **App shell** (signed-in pages; `AppShell` with `AppLayout` or `AdminLayout`):
  - ≥1024px: a sticky 248px white sidebar with a hairline right border. Top to bottom: wordmark, one main action (a 40px navy-outlined pill), nav with icons (40px rows), account menu pinned to the bottom above a hairline. The main action is a `LinkButton`: homeowner "New request" (to `/artisans`), artisan "Edit profile" (to `/workspace/profile`), admin none. The account menu shows avatar, name and role and opens upward (Account, Sign out).
  - <1024px: a sticky 64px white top bar with a hairline bottom border (wordmark, avatar-only account menu that opens downward) and a fixed bottom tab bar, 64px plus the safe-area inset, one tab per nav item. Main has extra bottom padding, `scroll-padding-bottom` is 88px so focused fields clear the bar, and toasts lift above it only while the bar exists (`BottomTabs` sets `data-has-tabbar` on `html`).
  - Exactly one `nav` landmark labelled "Main" is visible at each width.
  - Nav items (`layouts/nav.js`): homeowner Requests and Find an artisan; artisan Requests and My profile; admin Users, Problems and Payments. The old support tab strip is gone; queue counts sit in the `PageHeader` summary.
  - The verify-email banner sits above main. The skip link is first and route changes move focus to the h1.
- **Workspace:** the request list is a `PageHeader` ("Requests", summary "N requests need you"), a `FilterBar` with a Status select, then `Tabs` in `?tab=` (Needs you, Waiting, Finished, each with a count) over a `Panel flush` of 4-column `DataRow`s (request, status with mini `StageSteps`, next deadline, amount), sorted by nearest deadline. Choosing a status replaces the tabs with one flat paginated list. Finished shows 10 rows with "Show all finished (n)". There is no overview or stats page; the request list stays home.
- **Request detail:** `PageHeader` (other party and status as the title, the description clamped to two lines, a "Back to requests" link, a status badge), then a full-width stage `Panel` holding `StageSteps`. Below it, at ≥1024px, an 8/4 split: the current-stage panel with one primary action, then history on the left; a sticky "Details" panel on the right with People, Schedule and Money groups. On mobile the Details panel follows the stage panel.
- **Workspace profile:** `PageHeader` with the rating summary and a "View public profile" button, then one `Panel` per group (What you do, Where you work, Contact (private), Availability) and a single Save changes button.
- **Admin:** `PageHeader` with a count summary, then a `Panel flush` of compact (40px) `DataRow`s with a caption-size column header row from 1024px. Users shows Name, Email, Role, "Email verified", Status and Created. Problems and Payments are separate pages. Detail pages have their own route with an 8/4 split and a sticky "Details" panel. Record ids are not shown, except the payment id in the payments queue.
- **Responsive:** mobile-first, breakpoints 640 / 1024 / 1280.
  - ≥1024px: everything above; the app shows the sidebar.
  - <1024px: the app shows the top bar and bottom tab bar; side panels stack under the main column.
  - 640–1023px: H1 48px; stage cards 2×2; the scroll list is stacked with inline media.
  - <640px: H1 40px; hero buttons stacked and full width; icon tabs in a horizontally scrollable row; cards stacked.

## Components and states
- Every interactive component covers default, hover, active (`scale(0.98)`), focus-visible, disabled and loading, plus error and selected where relevant.
- **Buttons** are ranked by importance, not coloured by meaning:
  - primary (and `ink`): navy fill, on-ink text
  - secondary: transparent with a 1px navy outline, `tint` on hover
  - light: on-ink fill, navy text (on the hero gradient)
  - tertiary: the `.link` style
  - destructive: error fill with on-ink text, only inside confirmation dialogs

  Sizes: default 44px / 16px radius / 14px text; compact 36px / 8px radius (admin tables); large 50px / 20px radius / 16px text (public pages). While loading, the label switches to its "-ing…" form with an inline spinner and the width stays fixed.
- **Inputs:** visible label above, helper below, error below in error colour with an icon. White fill, 1px border-strong, 8px radius; the border turns navy on hover and focus. Labels are 14px medium. Validate on blur and on submit; keep the user's input after an error and focus the first invalid field. Correct `type`, `autocomplete` and `inputmode`.
- **MoneyInput:** whole naira with a ₦ prefix and `inputmode="numeric"`. Shows the formatted figure ("₦2,500.00") and sends kobo (×100).
- **DateTimeInput:** native `datetime-local` plus a visible zone label (e.g. "WAT, UTC+01:00"). Sends ISO 8601 with the local offset.
- **Switch:** on = ink track with a lemon thumb; off = surface-2 track with a border-strong outline.
- **Rating stars:** filled = lemon fill with an ink stroke; empty = border-strong stroke.
- **PageHeader:** the page's single h1 (`text-h1`, focusable so route changes can move focus), an optional slate summary line (`aria-live="polite"`) and an optional actions slot on the right from 640px (the request list puts its inline Status filter there). Children render below.
- **Panel:** see Cards and surfaces. Optional title (h2 by default, `text-h3`), description and header action; `flush` for edge-to-edge rows.
- **Tabs (app, underline):** Radix tabs in a row with a 1px bottom border; 48px tall triggers 24px apart, 14px medium slate text, the active one navy semibold with a 2px navy bar. An optional numeric `count` shows as a round chip (`tint`, `lime` when active) and is folded into the accessible name ("Needs you, 1"). `param` syncs the active tab to `?param=` with replace, and unknown values fall back to the default. The row scrolls horizontally without a scrollbar; the focus ring is inset.
- **FilterBar:** a `role="group"` row of labelled controls above a list, wrapping, controls at least 12rem wide and full width below 640px. "Clear filters" (tertiary) shows only when there is something to clear.
- **DataRow:** one row of a list inside `Panel flush`, rendered as an `li`. 64px minimum (compact: 40px, 14px text), 16px side padding (24px from 1024px). With `to` the whole row is a single link (hover `surface-2`); without it the row is read-only. `columns` sets the grid at ≥1024px; below that cells sit in a flex row and may use `order-*` to wrap, which `DataRow` resets to source order at ≥1024px. `selected` gives `lime-soft` plus a 3px lime start bar and `aria-current`. Numeric cells are right-aligned and tabular.
- **Select:** a native `<select>` with the input style (44px, border-strong, 8px radius) and a drawn chevron. Kept native for reliability on low-end Android; it is not a custom listbox.
- **EmptyState:** centred: a 48px `lime-soft` icon chip (14px radius), one sentence (max 48ch, `muted`) and an optional action. Used inside `Panel` (`flush` for lists).
- **Skeletons:** `Skeleton` is a pulsing `surface-2` block; `SkeletonRows` matches `DataRow` height and padding (`compact` for admin); `SkeletonPanel` is a title bar plus text lines. Pulse stops under reduced motion.
- **Toast:** bottom-right, `shadow-overlay`, `aria-live` via Radix; lifts 64px plus the safe-area inset above the bottom tab bar below 1024px, only when the bar is present.
- **Tabs (landing feature carousel):** `tablist`/`tab`/`tabpanel`, roving tabindex, Left/Right/Home/End, previous/next buttons that wrap.
- **Accordion cards:** each title is a button with `aria-expanded` and `aria-controls`; Left/Right move between cards; hover, focus or click expands.
- **Scroll list:** each item title is a button; Enter/Space/click activates; the active item carries `aria-current`. Inactive items are muted by colour, not opacity (see the accessibility gate).
- **Tables and lists:** app lists are `DataRow`s in a `Panel flush`, not `<table>`s; the column header row is `aria-hidden` and shown from 1024px. Text left-aligned, numbers right-aligned and tabular, 1px border separators, no zebra striping.
- **Overlays:** Radix Dialog/AlertDialog trap focus and return it to the trigger. Every destructive action uses an AlertDialog that names the target. Hard delete also requires typing the account email.
- **Empty, loading, error and conflict states:**
  - empty: one plain sentence and one action
  - loading: skeletons shaped like the real content; no full-page spinner after first paint
  - error: what happened, what to do, and Retry
  - conflict (409): an inline notice in the action panel after an automatic refetch: "This job changed while you were looking — here's the latest."

## Motion
- Durations: instant 100ms / fast 150ms / normal 200ms / slow 300ms.
- Easings: `--ease-out` cubic-bezier(0.23,1,0.32,1); `--ease-in-out` cubic-bezier(0.77,0,0.175,1); `--ease-exit` cubic-bezier(0.4,0,1,1).
- Never `transition: all`; name the properties. Prefer `transform` and `opacity`. Allowed exceptions: colour properties on hover and state change, `box-shadow` on the nav, and `flex-grow` on the stage cards.
- **Patterns:**
  - tab carousel: panel content cross-fades over 200ms with an 8px upward translate; the connector stem slides under the active tab over 200ms
  - stage cards: `flex-grow` over 300ms ease-out; the expanded content fades in after it
  - scroll list: IntersectionObserver picks the active item; colour changes over 200ms; the sticky media cross-fades over 300ms
  - nav: `box-shadow` over 200ms
  - stage change: `StageSteps` markers and connector change colour over 300ms, once per change, never on load
  - popovers scale from 0.96 at the trigger; dialogs fade and scale from 0.98; toasts slide 8px
- **Reduced motion:** no transforms and no width animation; swaps are instant (100ms opacity at most). Countdowns tick once a minute with no animation.

## Iconography
- lucide-react on a 24px grid with `strokeWidth={1.75}` and round caps; 20px inline, 16px in tables.
- **Nav icons** (`layouts/nav.js`, 20px, stroke 1.75, 2.25 on the active item): Requests `inbox`, Find an artisan `search`, My profile `user-round`, Users `users`, Problems `triangle-alert`, Payments `banknote`. The sidebar main action "New request" uses `plus`. The account menu uses `chevrons-up-down`. Empty states use `inbox`, `hourglass`, `check-circle-2`, `search-x`, `users` and `wallet` in the lemon chip.
- **Icon chip:** a 24px (32px in lists) `rounded-sm` lemon square holding an ink icon, followed by a 16px medium label. It tags a section or a card. It is not an eyebrow: it is sentence case, has an icon and never sits as tracked uppercase text.
- **Profession glyphs:** Plumber `wrench`, Electrician `plug-zap`, Carpenter `hammer`, Painter `paint-roller`, Welder `flame`, Brick Layer `brick-wall`, Auto Mechanic `car`, Others `tool-case` (fall back to `toolbox`).
- Decorative icons get `aria-hidden`; icon-only buttons get an `aria-label`. No emoji.

## Imagery and illustration
- Product UI only. Media panels on the landing are flat mocks built from plain markup with sample data and labelled "Sample data". No stock photos, illustrations, blobs or third-party logos.
- **Avatars:** `avatar.url`, otherwise `/avatars/{role}.svg`, falling back to `house_owner`; a missing participant shows the role default and "Former Fixly user"; circles at 32/40/64px with explicit width and height and a 1px inset outline at `rgba(0,0,0,.1)`.

## Dark mode
- **Source:** `frontend/src/styles/dark.css` overrides the semantic tokens under `@media (prefers-color-scheme: dark)` (unless `<html data-theme="light">`) and under `<html data-theme="dark">`. `lib/theme.js` stores the choice (`fixly-theme` in localStorage: system / light / dark); an inline script in `index.html` applies it before first paint and sets `theme-color`.
- **Switcher:** a sun/moon menu in the public header and on auth pages; a Theme radio group in the account menu.
- **Ground:** deep navy (`bg` #09111E, `surface` #101B2B, `surface-2` #182538), near-white text (`fg` #ECF0F4), slate muted (#98A5B3, 6.9:1 on surface). Hairlines are `fg` at 12%.
- **Ink flips** to near-white with navy `on-ink`, so the primary button stays the highest-contrast element.
- **Fixed in both themes:** `band` (footer, hero base) with `on-band` text, `scrim` behind dialogs, and `on-bright` navy, the only text colour on lemon and lime fills (`accent-fg` points at it). Use `.focus-on-band` for controls on the band or the hero.
- **Brights:** lemon and lime keep their values; `accent-soft` and `lime-soft` become deep olive/green tints. Status colours lighten and their soft fills darken (all ≥5.7:1).
- **Elevation:** shadows get darker and weaker, so menus, toasts and dialogs also carry a 1px `border`.

## Accessibility
- AA contrast for every text/background token pair (see the gate results below).
- Visible, managed focus: 2px ink outline, 2px offset. A skip link is the first focusable element, and route changes move focus to the page h1.
- Full keyboard operability, including the tab carousel, the stage cards and the scroll list. Targets are 44px, never below 24px.
- Status and active state are never conveyed by colour alone.
- Toasts and form errors use `aria-live="polite"`. Countdown regions use `aria-live="off"` with a static text equivalent.
- Respect `prefers-reduced-motion`; layouts survive 200% zoom.

## Tokens (source of truth)
Adapter: Tailwind v4 `@theme` in `frontend/src/styles/tokens.css`. That file is authoritative; this is a copy.

```css
@theme {
  /* Calendly's type system, measured on calendly.com: Geist for UI and headings at weight 500,
     and a text serif for split-section headings. Calendly Sans and Wulkan Text are proprietary;
     Geist and Newsreader are the OFL stand-ins. */
  --font-display: "Geist Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-body: "Geist Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-serif: "Newsreader Variable", Georgia, "Times New Roman", serif;

  /* App scale (workspace, admin, forms). Body line-height 1.4, as on the reference. */
  --text-caption: 0.8125rem; --text-caption--line-height: 1.4;
  --text-small: 0.875rem; --text-small--line-height: 1.4;
  --text-body: 1rem; --text-body--line-height: 1.4;
  --text-lead: 1.125rem; --text-lead--line-height: 1.4;
  --text-h3: 1.25rem; --text-h3--line-height: 1.4; --text-h3--letter-spacing: -0.01em;
  --text-h2: 1.5rem; --text-h2--line-height: 1.25; --text-h2--letter-spacing: -0.02em;
  --text-title: 1.75rem; --text-title--line-height: 1.2; --text-title--letter-spacing: -0.02em;
  --text-h1: 2rem; --text-h1--line-height: 1.15; --text-h1--letter-spacing: -0.03em;

  /* Display scale (public pages): 36/40/48/60/72 at line-height 1.1, -1px to -2px tracking. */
  --text-display-xs: 2.25rem; --text-display-xs--line-height: 1.1; --text-display-xs--letter-spacing: -0.028em;
  --text-display: 2.5rem; --text-display--line-height: 1.1; --text-display--letter-spacing: -0.035em;
  --text-display-md: 3rem; --text-display-md--line-height: 1.1; --text-display-md--letter-spacing: -0.042em;
  --text-display-lg: 3.75rem; --text-display-lg--line-height: 1.1; --text-display-lg--letter-spacing: -0.033em;
  --text-display-xl: 4.5rem; --text-display-xl--line-height: 1.1; --text-display-xl--letter-spacing: -0.028em;

  --spacing: 0.25rem;

  /* sm: badges, chips, icon buttons, menu items. md: buttons, inputs, app panels, dialogs.
     lg: media panels, large buttons. xl: public cards and containers below 1024px.
     2xl: public cards. 3xl: hero and section containers. 4xl: sticky media squares. */
  --radius-sm: 8px; --radius-md: 16px; --radius-lg: 20px;
  --radius-xl: 32px; --radius-2xl: 48px; --radius-3xl: 64px; --radius-4xl: 80px;

  --shadow-overlay: 0 12px 32px -8px rgb(7 26 49 / 0.18), 0 2px 6px rgb(7 26 49 / 0.08);
  --shadow-raised: 0 20px 48px -12px rgb(11 53 88 / 0.16);
  --shadow-card: 0 1px 2px rgb(7 26 49 / 0.04), 0 4px 12px -4px rgb(7 26 49 / 0.06);
  --shadow-nav: 0 4px 5px rgb(95 109 119 / 0.04), 0 6px 10px rgb(95 109 119 / 0.05);

  /* Neutrals are Calendly's: a warm near-white ground, navy headings, slate body text and
     navy-tinted hairlines. */
  --color-bg: rgb(252 251 248);
  --color-surface: rgb(255 255 255);
  --color-surface-2: rgb(245 243 238);
  --color-fg: rgb(7 26 49);
  --color-fg-2: rgb(61 70 78);
  --color-muted: rgb(95 109 119);
  --color-border: rgb(7 26 49 / 0.1);
  --color-divider: rgb(216 220 224);
  --color-border-strong: rgb(134 144 153);
  --color-ink: rgb(7 26 49);
  --color-ink-hover: rgb(22 48 80);
  --color-on-ink: rgb(252 251 248);
  --color-tint: rgb(7 26 49 / 0.05);

  /* Brand: lemon and lime. Fills only; text on them is always navy. */
  --color-accent: oklch(0.93 0.17 105);
  --color-accent-hover: oklch(0.89 0.17 100);
  --color-accent-soft: oklch(0.975 0.05 105);
  --color-accent-fg: var(--color-ink);
  --color-lime: oklch(0.90 0.19 128);
  --color-lime-soft: rgb(242 248 222);

  --color-success: oklch(0.47 0.09 165); --color-success-soft: oklch(0.955 0.035 165);
  --color-warning: oklch(0.50 0.13 50); --color-warning-soft: oklch(0.955 0.035 55);
  --color-error: oklch(0.50 0.17 27); --color-error-soft: oklch(0.955 0.03 25);
  --color-info: oklch(0.48 0.09 240); --color-info-soft: oklch(0.955 0.02 240);

  --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --duration-instant: 100ms; --duration-fast: 150ms; --duration-normal: 200ms; --duration-slow: 300ms;
  --breakpoint-sm: 40rem; --breakpoint-lg: 64rem; --breakpoint-xl: 80rem;
}
```

Components use only semantic utilities (`bg-surface`, `text-muted`, `rounded-md`). Raw hex values and Tailwind palette classes (`gray-200` and the like) are banned. Check with:

```sh
cd frontend && grep -rnE "#[0-9a-fA-F]{3,8}\b|(bg|text|border|ring|fill|stroke|from|via|to)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]" src --include=*.jsx --include=*.js --include=*.css | grep -v "\.test\."
```

## Cards and surfaces
- **App panel (`Panel`):** `bg-surface`, a 1px 10%-navy `border`, `shadow-card`, `rounded-lg` (20px), 20px padding (24px at ≥1024px). It carries the page's content: every list, form section, stage block and facts block is a `Panel`. A `Panel` never contains another `Panel`. `flush` drops the body padding so `DataRow`s run edge to edge under a bordered title row. Account sections add a footer row (top border, save button right-aligned from 640px) inside the panel.
- **Public card:** `bg-surface`, no border, `rounded-xl` (32px) below 1024px and `rounded-2xl` (48px) from 1024px, 24–48px padding. It sits on `bg`, `surface-2` or the mesh, so the tone shift separates it.
- **Media panel:** `bg-surface-2` (or `accent-soft` for the sticky panel), `rounded-lg` (20px) inside a card, `rounded-xl`/`rounded-3xl` when it stands alone.
- **Section container:** inset from the viewport, `rounded-xl` below 1024px and `rounded-3xl` (64px) from 1024px.
- Never nest panels: no bordered or filled card inside another card. Inside a card, group with spacing and 1px dividers; a media panel is the single allowed inner layer. The feature card over the hero is a sibling of the hero, not a child.

## Copy voice
- Second person, sentence case, active verbs. A button names its outcome and the toast echoes it ("Send quote" → "Quote sent").
- Errors say what happened and the next step, without apologising.
- Times always carry their zone. Money always shows ₦ with two decimals.
- **Banned:**
  - words: Elevate, Unlock, Supercharge, Seamless, Empower, Streamline, Leverage, all-in-one, journey, effortless, hassle-free
  - trust claims: "verified professional", "trusted", "top-rated" (unless `ratingSummary.count` ≥ 1), "#1", "world's best"
  - patterns: "Good morning, {name}", "not just X — it's Y", "→" appended to labels, middot strings ("A · B · C"), eyebrow labels, invented statistics
- Email verification is never presented as identity verification.
- **Reference patterns we do not copy:** the uppercase label above the H2 (use the icon chip + label or let the H2 stand alone); the "sign up • no card" middot line (one plain sentence instead); "Learn more" with an arrow (an underlined link that names its outcome); statistic headings.

## Slop audit
Run 2026-11-23 after the lemon + white conversion, in headless Chromium at 1440px and 390px against the dev build with a mocked API. Screens checked: landing, directory, login, register, specimen, request list, account. Before/after screenshots: `docs/design/screenshots/`.

**Re-run needed (2026-11-23):** the lime pair, the app shell, the new panel and row components and the redesigned pages came after this audit. The checklist and tests below describe the earlier build and have not been re-run.

**Slop checklist**

| check | result |
|---|---|
| purple/indigo gradient, glassmorphism, glow | none |
| Inter/system font as the brand face | none (Geist, with Newsreader for split-section headings) |
| emoji as icons | none |
| three-icon feature grid | none (tab carousel, stage cards, scroll list instead) |
| eyebrow label on every section | none (icon chip + label on two sections, H2 alone on the rest) |
| benefit-speak and banned words | none; the landing test enforces the banned list and rejects `·`, `•` and `→` |
| invented statistics or trust claims | none; the rating mock shows no numbers |
| centred hero on a gradient | **present by owner direction** (reference structure). Mitigated: the mesh is one hue, the text is ink, the media is product UI |
| uniform large-radius cards | **present by owner direction** (reference structure) |
| stock imagery, illustration, blobs | none; media panels are flat product mocks labelled "Sample data" |

**Tests**
- **Swap test (would it pass as another brand with the logo swapped?):** partial pass. The page skeleton is deliberately the reference's, so layout alone does not identify Fixly. What does: the navy-to-lemon hero gradient, the solid wrench logo, the stage vocabulary, and the "What Fixly does not do yet" section.
- **Squint test:** pass. At a blur the hero reads as headline, then the ink button, then the lemon active tab; in the app the single lemon button per panel is the first thing seen.
- **Signature test:** pass, weaker than before. The lemon fill with ink appears on the primary button, active tab, icon chips, current stage marker, selected cards and link underlines. It is a colour rule, not a drawn device like the retired tape.
- **Token test:** pass. The grep in "Tokens" returns nothing; no `transition: all`; no `surface-inset`, `warning-mark` or tape imports remain.

**Accessibility gate**

Status after the 2026-11-23 redesign: the shell was checked in a browser at 1440px and 390px (pass: one nav landmark per width, keyboard order, the account menu opens upward, no horizontal overflow, nothing hidden by the tab bar). A full-site browser check has not been run yet. The table below is from the earlier lemon + white run and is not re-run for the redesigned pages. The new token pairs are computed from the OKLCH values (`dev/contrast.js`, asserted in `dev/Specimen.test.jsx` at 4.5:1 minimum):

| pair | ratio |
|---|---|
| ink on lime | 13.40:1 |
| ink on lime-soft | 15.86:1 |
| muted on lime-soft | 5.49:1 |
| success on success-soft | 5.78:1 |
| success on white | 6.51:1 |
| ink on the worst point of the mesh (with the lime stop) | 14.5:1 |
| fg-2 on the same point | 7.7:1 |

The mesh ratios are from the redesign notes; the test does not assert them.

Earlier run:

| check | result |
|---|---|
| text contrast, every visible text node on 7 screens × 2 widths | pass, lowest 5.51:1 (muted on surface-2). The only values under 4.5:1 are disabled controls at 50% opacity, which are exempt |
| token pairs | fg 16.6:1 on bg, 14.3:1 on lemon, 12.5:1 on lemon-hover; fg-2 8.8:1; muted 5.7:1 on bg, 5.5:1 on surface-2, 5.6:1 on lemon-soft; on-ink 16.6:1 on ink, 6.3:1 on error; status colours 5.4–5.7:1 on their tints; border-strong 3.3–3.6:1 |
| hero mesh | ink on the darkest point (lemon at 60%) 15.0:1; fg-2 8.0:1 |
| focus visible | pass: `solid 2px` ink outline, 2px offset, on every focusable element |
| keyboard: tab carousel | pass: Left/Right/Home/End move and select, previous/next wrap, `aria-selected` and the panel follow |
| keyboard: stage cards | pass: Enter on a title sets `aria-expanded="true"` and widens the card (339px against 242px); Left/Right move between titles |
| keyboard: scroll list | pass: Enter on a title sets `aria-current`; scrolling advances the active item in order |
| reduced motion | pass: every transition resolves to 100ms, no running animations, no translate or width animation |
| targets | pass: no link or button under 24px; primary controls 44–50px |
| minimum text size | 13px |
| horizontal overflow at 390px and 1440px | none |
| never-nest rule | pass: the feature card is a sibling of the hero, not a child |
| automated tests | 240 passing in 26 files; lint and build clean |

**Known gaps**
- The lemon link underline is 1.4:1 against white. A link is still told apart by its medium weight and the underline's presence, but the underline itself is faint. If this proves too weak, switch the resting underline to ink and keep lemon for hover.
- A lemon button on a white card has no 3:1 boundary (1.2:1). Its ink label identifies it; an ink hairline border is the fix if needed.
- The payments queue shows the payment id and a "View problem" link only when a matching problem is open. It has no request reference, because record ids are hidden everywhere else. Open owner question: should a payment row show a request reference (the other party's name or a short code)?
- `VerifyEmail` and `ConfirmEmailChange` do not use `AuthFrame`; they keep a plain single column.
- The API has no bio, review list or member-since fields, so artisan detail shows the headline, years of experience, skills and the rating summary only. The Reviews panel is the rating summary, not a list.
- Not checked in a browser since the redesign: every page except the shell (see the accessibility gate). Also not checked: screen-reader output, forced-colors mode, 200% zoom.

## Changelog
- 2026-11-23: initial system. Workshop modern on a cool neutral ground (cream removed per anti-slop rules); Archivo + Atkinson Hyperlegible Next (Public Sans failed the pairing rule); tape signature.
- 2026-11-23: Task 2 verified fonts: Archivo has wght 100–900, wdth 62–125 and tnum, but only via the `/wdth.css` entry; Atkinson unchanged. All text pairs pass 4.5:1, no token values changed.
- 2026-11-23: moved from "workshop modern / teal / tape signature" to "Calendly-structured, lemon + white". Structure, spacing, radii and type scale follow measurements of calendly.com (`docs/reference-calendly.md`); colours, fonts, copy and media are ours.
  - Palette: teal accent replaced by a lemon fill with ink text; neutrals re-hued from cool (215–220) to warm (100); `surface-inset` renamed `surface-2`; `on-ink` added; warning re-hued from amber to orange so it cannot be confused with lemon; `warning-mark` removed with the tape.
  - **Tape signature retired** (owner decision, 2026-11-23). `Tape` and `SplitTape` are replaced by `StageSteps` and `SplitBar`. The signature is now the lemon fill with ink on top.
  - Radii: from two values (4/8px) to a six-step scale (8/16/20/32/48/64px). Shadows: `--shadow-raised` and `--shadow-nav` added.
  - Type: display scale added (36–72px, line-height 1.1, tracking to −0.03em); heading weight 720 → 740, display 800.
  - Layout: the public landing now has a centred hero and the six section patterns above (the old rule "no centred hero" is withdrawn). App and admin layouts are unchanged; they take the new tokens through shared components. The ink header band is replaced by the sticky light nav.
  - Focus ring: lemon cannot be seen on white, so the ring is a 2px ink outline with a 2px offset.
  - Motion rule relaxed to allow `flex-grow` (stage cards), `box-shadow` (nav) and colour transitions.
- 2026-11-23 (owner decisions): redesign so the whole product reads as a modern SaaS app, still using calendly.com for structure only.
  - Palette: lime (`oklch(0.90 0.19 128)`) and lime-soft added. Lemon means "do something", lime means "you are here"; neither is text or a control's only edge. Success re-hued from 150 to 165 (`oklch(0.47 0.09 165)`, soft `oklch(0.955 0.035 165)`) so it cannot be mistaken for lime-soft. Mesh gains a lime stop.
  - App shell: 248px sticky sidebar from 1024px (wordmark, one main action, icon nav, upward account menu); below that a 64px top bar and a fixed bottom tab bar. Content max 1120px (admin 1280px). Active sidebar item is `lime-soft` plus a 3px lime bar, not a solid lime fill. Admin nav is Users / Problems / Payments; the support tab strip is removed.
  - `/artisans` and `/artisans/:id` use `AdaptiveLayout` (app shell when signed in, public layout when signed out).
  - Components added or restyled: `PageHeader`, `Panel`, `Tabs` (underline, lime, counts, URL sync), `FilterBar`, `DataRow`, `EmptyState`, `Select` (native, chevron), `SkeletonRows`/`SkeletonPanel`.
  - Pages: request list (tabs, filter bar, row panel), request detail (8/4 with a sticky Details panel), directory (Filters panel and rows, ₦ with two decimals), artisan detail (header panel plus 8/4), account (section nav and one panel per section), auth (`AuthFrame` split screen), admin (dense rows, 8/4 detail, "Email verified" wording, ids hidden).
  - Landing: lime mesh stop, `AppWindow` mocks, mini mocks on stage cards, a new audiences section before the closing section, a 3-column ink footer.
  - No overview or stats page; the request list stays home.
  - Slop audit and the accessibility gate need re-running; the shell has had a browser check only.
- 2026-11-23 (owner direction: "copy Calendly's styles"): restyle to match calendly.com closely, keeping lemon and lime.
  - Fonts: Archivo + Atkinson replaced by Geist (all UI, weight 500 headings) and a Newsreader serif for split-section H2s.
  - Neutrals: warm greys replaced by navy (`#071A31`) text and buttons, slate (`#5F6D77`) body, 10%-navy hairlines and a `tint` hover fill.
  - Buttons: primary is navy fill, secondary a navy outline; lemon is no longer a button colour. Links use a navy underline.
  - Landing: the hero becomes a navy-to-lime-to-lemon gradient with light text and the feature card inside it; saturated gradient media squares and card frames; `.soft-gradient` for the stage cards and closing section.
  - App: white sidebar with an outlined pill action and lime-soft active rows; panels at 20px radius with `shadow-card`; navy tab underline; the request list Status filter moves into the header actions; default avatars recoloured to navy on lime, lemon and grey tints.
  - Fixed: `DataRow` resets mobile `order-*` at ≥1024px, which had shuffled desktop columns.
- 2026-11-23 (owner: section text "too large and thick"): display steps cut to 30/36/40/48/64px, heading weight 500 → 450, serif 500 → 400, stage-card titles 28 → 20/24px, scroll-list titles 20 → 18px. The scroll-list sticky header now sticks under the nav with a covering background, so items no longer show above it.
- 2026-11-23 (owner): feature-tab card text cut to a 20/24px heading and 14px body, with lighter mock text; the stage section H2 now stops at 40px and its card titles are 20px. The auth pages drop the white app-preview mock and become a 50/50 split: form on the left, gradient on the right.
- 2026-11-23 (owner): auth pages become full-page: the top bar and footer are removed there, the gradient fills the whole right half, and the wordmark moves into the form half.
- 2026-11-23 (owner): the hero tab's diamond notch is replaced by the reference's connector: a 40×18px stem in the card colour with concave fillets at both ends, joining the active tab to the feature card across a 16px gap. The logo tile is removed from the auth gradient half.
- 2026-11-23 (owner): the logo is a single-colour silhouette with no tile: Lucide's wrench (ISC), filled, in the current text colour (navy on light grounds, white on the footer band). The favicon (still Vite's default) is replaced by the same wrench in navy.
