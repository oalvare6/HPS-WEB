# UX worklist — 2026-08-26

## STATUS: INCOMPLETE. Read this before using the file.

**The ranked worklist is not written, because the critique document never arrived.**

This session was given two documents to file. Only one landed:

- `docs/ux/measurements-2026-08-26.md` — **filed, verbatim, byte-identical to the original.**
- `docs/ux/critique-2026-08-26.md` — **missing.** Not in the upload, not anywhere on disk.

The worklist was specified as *"walk the critique in its own ranked order and turn each item
into a numbered entry."* Without the critique there is no order to walk. Inventing one would
mean silently substituting my judgment for the ranking the operator asked to preserve — the
exact thing the brief warned against. So the numbered entries are absent, and the section
**"CLAIMS I COULD NOT VERIFY"** is absent with them: it exists to check *the critique's* claims
against the measurements, and there are no claims to check.

**What IS done, and is not throwaway:** the expensive half of every worklist entry — *"the
files you'd expect to touch, found by actually searching the repo, not guessed"* — is finished
below, for every observation the measurements file contains. So is the pre-work for the
unverifiable-claims section: §3 lists what the measurements can and cannot settle, which is the
test each critique claim will be run through.

**To finish this file:** drop the critique at `docs/ux/critique-2026-08-26.md`, then walk it in
its own order, pulling files from §2 and numbers from the measurements. §3 is the filter.

---

## 1. Ground rules for whoever picks this up

- **Live production, tournament running.** Real players, real waivers, real payments. Nothing
  to `main` without review.
- **MECHANICAL vs STRUCTURAL** is the classification the brief asks for. Mechanical = contained
  change to markup or styles, no behaviour change. Structural = changes a flow, a layout
  decision, or what appears where. Where I already know which one an item is, §2 says so.
- **Tailwind is stock apart from colors and fonts.** `sm`/`md`/`lg` are 640/768/1024. Fixes go
  in markup.
- **Dark-only is deliberate.** `<html className="dark">` is not a bug.
- **The measurements are the evidence.** Any DONE WHEN condition should quote a number from
  them where one exists.

---

## 2. Evidence → file map

Every row below was confirmed by opening the file. Nothing here is inferred from a route name.
Line numbers are as of commit `f8639b5`.

### 2.1 Shell and cross-cutting

| Measured observation | File | What's actually there |
|---|---|---|
| 30px horizontal overflow at exactly 768 (admin pages); 113px on public signed-out pages | `src/components/layout/header-client.tsx:62` | `hidden md:flex items-center gap-8` — the desktop nav group appears at stock `md` = 768 with no room for it. Mobile controls at `:112` are `md:hidden`. The two sets swap at the same pixel, so there is no width where a fitting layout is chosen. **Note the two different numbers: 30px admin, 113px public.** Same cause, different content widths. STRUCTURAL — it is a breakpoint decision, not a style tweak. |
| Header logo distorted; `object-fit: fill`; 20.3x44 from a 48x46 source at 768 | `src/components/layout/header-client.tsx:47-55` + asset `public/brand/hps-badge.png` | Asset is **512x495 — not square.** Next.js resizes preserving ratio (→48x46); the markup then forces it into a square `w-10 h-10 md:w-12 md:h-12` box via `w-full h-full` with no `object-contain`. Root cause is the markup, not the asset. MECHANICAL. |
| Two stacked sticky bars in admin (public header z-50 over admin nav z-40) | `src/components/layout/header-client.tsx:42` and `src/components/admin/AdminShell.tsx:57` | Both are `sticky top-0`. The public `<Header/>` lives in the **root** layout (`src/app/layout.tsx:82`), so it renders over `/admin` too; `src/app/admin/layout.tsx` stacks `AdminShell` beneath it. Removing one bar from admin means changing where `<Header/>` renders — STRUCTURAL. |
| Footer legal row + copyright at 3.9:1 (#71717a on #07111f) | `src/components/layout/footer.tsx:122-142` | `text-zinc-500` on all six legal links and the copyright line. Below WCAG AA 4.5:1 for body text. MECHANICAL. |
| At 390, footer legal row sits *underneath* the fixed bar (bar y771-844, links y776-796) | `src/components/layout/quick-actions-bar.tsx` (mobile block) + `src/components/layout/footer.tsx` | Bar is `md:hidden fixed bottom-0 left-0 right-0 z-50`; there is no compensating bottom padding on `body` or `main` (measurements confirm both are 0). MECHANICAL. ⚠ Note git history: 11 dead bottom spacers were deliberately removed in `702be9f` — do not simply re-add one globally; the bar is homepage-only. |
| "Need a website?" fixed external link, 768 and 1440 only | `src/components/layout/qro-badge.tsx` | `hidden md:flex fixed bottom-5 left-5 z-40`, `href="https://qronnect.pro"`. Absent at 390 by design. Whether it should exist at all is a **business decision, not a UX defect** — flag, don't assume. |
| Fixed bottom bar at 390 becomes a sticky top bar at 768 | `src/components/layout/quick-actions-bar.tsx` | Two separate blocks: `hidden md:block sticky top-20` and `md:hidden fixed bottom-0`. Confirms the measured switch at exactly 768. |
| `<html class="dark">` | `src/app/layout.tsx` (`<html lang="en" className="dark">`) | Intentional. Not an item. |

### 2.2 Admin

| Measured observation | File | What's actually there |
|---|---|---|
| Admin nav is a horizontal scroller at 390 (client 375 / scroll 526; 151px off-screen) | `src/components/admin/AdminShell.tsx:58` | `flex items-center gap-1 md:gap-2 h-14 overflow-x-auto`. STRUCTURAL if the fix is a different nav pattern; MECHANICAL if it is only scroll affordance. |
| "Log out" at 390 is a 38x26 icon button with **no aria-label and no title**, at x=472 — 82px off-screen | `src/components/admin/AdminShell.tsx:~105` | `<span className="hidden sm:inline">Log out</span>`. Confirmed: the `<button>` carries neither `aria-label` nor `title`, so below 640 it has **no accessible name at all**. This is the one unambiguous a11y defect in the shell. MECHANICAL. |
| "View site" not rendered below 640 | `src/components/admin/AdminShell.tsx:~93` | `hidden sm:inline-flex`. |
| Wordmark "Admin" below 640, "HPS Admin" from 640 | `src/components/admin/AdminShell.tsx:~66` | `hidden sm:inline` / `sm:hidden` pair. |
| Overview payments table: 3 columns at 390, 5 at 768, 6 at 1440 | `src/app/admin/page.tsx:444-512` | `hidden sm:table-cell` (Date), `hidden md:table-cell` (Email), `hidden lg:table-cell` (Event). Matches the measured counts exactly. Note the wrapper has `overflow-x:auto` but **is not scrolling** (scrollWidth == clientWidth) — the columns are removed, not hidden behind a scroll. STRUCTURAL if the question is "should Email/Event be reachable on a phone at all". |
| Event-list row controls all exactly 28x28, icon-only, `title` as the only accessible name | `src/app/admin/tournaments/page.tsx:374-447` | `p-1.5` + `size={16}` = 28px. Five per row × 5 rows = 25 such controls. `title=` on each, no `aria-label`. Includes **"Delete this event permanently"** at 28x28. MECHANICAL to enlarge/label; the delete-at-28px risk is worth its own note. |
| Roster table 640 wide in a 340 wrapper — scrolls sideways at 390 | `src/components/admin/RosterScreen.tsx:617-618` | `overflow-x-auto -mx-4 px-4` wrapper; `min-w-[640px]` with teams, `min-w-[480px]` without. |
| Roster toolbar icon buttons 31x31, `title` only | `src/components/admin/RosterScreen.tsx:325,334,346` | "Refresh" / "Check DocuSeal for signed waivers…" / "Download this roster as a spreadsheet". |
| Event tab row wraps to 112px tall at 390, starting at y842 in an 844 viewport | `src/app/admin/tournaments/[id]/page.tsx:286` | `inline-flex flex-wrap gap-1 bg-surface-2 rounded-lg p-1` — wraps rather than scrolls. Combined with the stat tiles stacking one-per-row above it, **everything the Roster tab contains is below the fold on a phone.** STRUCTURAL. |
| Open-play events: 4 tabs, "Who's coming" not "Roster", no Teams | `src/app/admin/tournaments/[id]/page.tsx:271-280` + `src/lib/event-kind.ts` | `showTeams={kindCopy.hasTeams}` gates it. Working as designed. ⚠ But the measurements record a real bug next to it: *"The summary strip above still shows five tiles including 'No team 1' on an event that has no teams."* That one is genuine. |
| Site settings: pill label input renders **34px wide**, its state select **568px** | `src/app/admin/site/page.tsx:36-37` and `:225-232` | **Root cause found.** `inputCls` begins `"w-full …"`. The select is `` `${inputCls} !py-2 w-32` `` — Tailwind emits `.w-full` after `.w-32` in the stylesheet, so `w-full` wins on equal specificity. The select gets `width:100%` with `flex-basis:auto`, claims the row, and starves the `flex-1` (`flex-basis:0`) input down to 34px. Fix: drop `w-full` for that one select (or give the input an explicit basis). MECHANICAL, and about a two-line change. |
| Contacts: "Expand" 16x16, "Fix duplicate…" 98.4x16 at 12px, ×97 rows | `src/app/admin/contacts/page.tsx:314-378` | `<li>` rows, not a table. `aria-label="Expand"` **is** present. `text-xs` on the duplicate control. 97 rows all rendered, page 15072 tall at 390. |
| Diagnostics speaks env-var / JWT / SDK / repo-path jargon | `src/app/admin/diagnostics/page.tsx` | Whole page. The measurements call it out as the only admin screen not in plain English — which matters because **the admin is being handed to a non-technical owner** (CLAUDE.md). Likely STRUCTURAL: the honest fix is deciding who this page is for. |

### 2.3 Public

| Measured observation | File | What's actually there |
|---|---|---|
| Times render inconsistently: "6:55 – 11:00" vs "7:00 PM – 9:00 PM" vs "7:00 PM – 10:05 PM" | `src/app/events/[slug]/page.tsx:356-358` and `:617-619` | **Root cause found.** `` `${tournament.time_start} – ${tournament.time_end}` `` — there is **no formatter at all**. The string is whatever was typed into the admin form. So this is a data-entry inconsistency exposed by a missing formatter, not a formatting bug. Fix is normalize-on-save, format-on-render, or both — and note the normalize path touches **live tournament data**. STRUCTURAL. |
| "Real grass field" vs "turf" | `src/app/events/[slug]/page.tsx:75-76,115-116,239,241` vs `src/app/facility/page.tsx:23,35,41,125-126` and `src/app/about/page.tsx:34` | Event pages: "Real grass field", "Natural turf under the lights". Facility page: "Quality turf", "Dedicated 7v7 turf fields", "Professional-grade turf", "No metal cleats on turf". `src/app/layout.tsx:42,59` (OG description) says "Quality grass field". **Only the operator can say which is true.** Copy decision, not a code fix. Expanded in §4.1 — it reaches link previews. |
| Event detail has exactly ONE "Sign up to play", 300x44, at y2565 of a 3990-tall page | `src/app/events/[slug]/page.tsx:708-717`; label computed in `src/lib/event-standing.ts` via `loadEventStanding` | ⚠ **The single, personalised CTA is a documented decision, not an oversight.** The comment at `:328-341` records the operator's own bug report — *"it still says register even though I am registered"* — and the choice to answer the CTA for *this visitor*. A critique item proposing "add a second CTA higher up" collides with that. The **position** (y2565 of 3990, i.e. ~64% down) is fair game; the **count** is a decision to be re-opened deliberately, not quietly. |
| /events prints each event's full description inline | `src/components/shared/TournamentCard.tsx:97-98` | `<p className="text-zinc-400 mb-4">{tournament.description}</p>` — no `line-clamp`. The idiom already exists in the codebase: `src/app/events/page.tsx:55` uses `line-clamp-3`. MECHANICAL. |
| /register: 12px labels on text inputs, 14px on three others | `src/components/register/RegistrationForm.tsx:90` vs `:319,372,560,651,706` | `labelClass = "block text-xs font-medium text-zinc-400 mb-1.5"` (12px) at `:667,:684`; group headings use `block text-sm font-semibold text-zinc-200` (14px). Two label idioms in one form — matches the measured 12/14 split exactly. MECHANICAL. |
| /register consent checkbox measures 13x20 (17x20 at 1440) | `src/components/register/RegistrationForm.tsx:446` | `<label className="flex items-start gap-3 cursor-pointer">` wrapping a native checkbox. A 13px-wide hit target on **the waiver consent control** on a phone. MECHANICAL, and high-stakes. |
| Homepage hero: 390x292 source into a 390x1173 box (~4x upscale) | `src/app/page.tsx:77-84`; asset `public/community/field-hero.png` | Asset is **1024x768, and is a JPEG with a `.png` extension** (`file` reports JFIF). A 4:3 landscape source is forced into a 390x1173 portrait box with `object-cover`. Same for `public/community/hps-community-7v7.png` (also JPEG-as-`.png`, 1024x768), used as the facility video poster and the "What Happens Here" background. MECHANICAL if the fix is art direction / a taller source; the hero *height* (1173 in an 844 viewport) is STRUCTURAL. |
| /pay says "or pick an event below" and renders no list | `src/components/pay/PayPageClient.tsx:49-56` | The early-return branch for `tournamentMissing \|\| !initialTournament` renders a heading, that sentence, and a single `View events` link. The copy promises something the branch does not render. Re-measured after a 2.5s wait — still nothing. Either the copy is wrong (MECHANICAL) or the list is missing (STRUCTURAL). **Cheapest correct fix is the copy.** |
| /me signed out redirects to /login with no explanation | `src/app/me/page.tsx:47` | `redirect("/login?next=/me")`. `src/app/login/page.tsx` never reads `next`, so the visitor gets an unexplained sign-in page. MECHANICAL to add the explanation; the `next` param is already there to key off. |
| /facility video: 720x1280 portrait source cropped into a landscape box | `src/app/facility/page.tsx:59-71` | `aspect-video` container, `object-cover`, `autoPlay loop muted playsInline`, `controls`, poster set. `autoPlay`+`loop`+`controls` together is an odd combination worth a decision. |
| /about has no CTA anywhere in the body at 390 | `src/app/about/page.tsx` | 16 interactive elements at 390 and they are the logo, the hamburger and footer links. STRUCTURAL. |

### 2.4 Asset note

`public/community/field-hero.png` and `public/community/hps-community-7v7.png` are **JPEGs
misnamed `.png`**. Nothing breaks (browsers and Next.js sniff the bytes), but it defeats tooling
that trusts the extension, and it means the "PNG" hero is already lossy. Worth one line in
whatever item touches hero imagery.

---

## 3. What the measurements can and cannot settle

This is the filter for the critique's claims. The brief asks for a "CLAIMS I COULD NOT VERIFY"
section covering claims that (a) rest on something the measurements don't contain,
(b) contradict a number in the measurements, or (c) are judgments no measurement can settle.
That section cannot be written without the critique — but the test it applies is below, and it
is the part that took the reading.

### 3.a The measurements file contains NOTHING on these — any claim resting on one is unverifiable

The measurements are explicit about their own scope: *"Nothing that writes was clicked."* That
excludes a large surface.

- **Anything visual.** No screenshots. Appearance, hierarchy, crowding, balance, "looks dated",
  "feels cheap", brand impression — none of it is in the file. This is the big one: the critique
  was written from descriptions, so *every aesthetic claim in it is unverifiable by construction.*
- **Every write path.** No form submissions, no validation errors, no error states, no payment
  flow, no waiver modal, no merge, no add/delete/reorder/feature controls, no exports, no
  third-party sync. Roughly half the admin's actual risk surface is unmeasured.
- **Keyboard and screen reader.** No focus order, no focus-visible styling, no tab traps, no
  announced names. The file measures *whether* a control has an accessible name (e.g. the
  logout button has none) but never how any of it is announced.
- **Performance on a real connection.** Explicitly stated: *"Duration on a slow phone connection
  was not measured."* Skeleton counts (58 pulse elements → 4) are recorded; perceived wait is not.
- **Signed-in player views.** `/me` and `/pay` were measured **signed out only**. The logged-in
  player experience — the one that matters most during a running tournament — is unmeasured.
- **Colour-blindness, reduced motion, print, forced-colours.**
- **Real devices and Safari.** Measurements come from one desktop browser at simulated widths.
  iOS Safari's viewport behaviour with a `fixed bottom-0` bar is exactly the kind of thing this
  method cannot see.
- **Text over images.** Contrast was computed *"against the nearest opaque ancestor background."*
  Hero text sits over a photo, so **no hero contrast ratio in the file is trustworthy** for the
  text that overlays imagery.
- **Three of five public events.** Only `community-cup-fall-2026` (all widths) and
  `spring-classic-2026` (390) were opened. The other three were listed, never visited.
- **Any width other than 390 / 768 / 1440.** Notably 1024 (`lg`) is unmeasured, and `lg` gates
  the Event column on the payments table.

### 3.b Numbers a critique is likely to get wrong — check against these

- **The 768 overflow is two different numbers.** 30px on admin pages, 113px on public
  signed-out pages. A claim citing one number for "the site" is imprecise.
- **Viewport height at 768 and 1440 was ~900, not 1024.** Stated in the method note. Every
  "above the fold" claim at those two widths is against a 900px window and would change on a
  taller screen. Only the 390 pass used a real device height (844).
- **The cards have no shadow.** Measured `box-shadow: rgba(0,0,0,0) 0 0 0 0` on both the
  dashboard cards and the admin login card. A critique praising or blaming card elevation is
  describing something that is not rendering.
- **There are no `position:fixed` elements on the admin overview at any width** — but there are
  two `sticky` ones. A claim about "floating admin toolbars" is wrong.
- **/pay does not redirect when signed out.** It renders its own page. Easy to assume otherwise.
- **At 390 the public header has exactly two visible controls** (logo, hamburger). Claims about
  header clutter on mobile are about the *opened menu* (which grows the header to 436), not the
  resting state.
- **The mobile register CTA is labelled "Sign up to play", not "Register".** Different string
  inside the collapsed menu than the desktop button.

### 3.c Stale-claim tripwires — recently changed, a critique may still be describing the old site

- **The floating WhatsApp button is gone.** Removed in `702be9f` along with 11 dead bottom
  spacers. Any item about a floating WhatsApp pill is describing a site that no longer exists.
- **Waiver display has one policy as of 2026-08-17.** Per CLAUDE.md: a covered person is a green
  ✓ whatever the paper trail. Any item proposing to surface more waiver nuance in the admin UI
  is re-opening a settled operator decision.
- **The header no longer shows "Register" to a signed-in player.** Changed deliberately; the
  comment at `header-client.tsx:78-83` records why.

### 3.d Judgments no measurement will ever settle — route these to the operator, not to code

- Whether "grass" or "turf" is the truth about the field.
- Whether the "Need a website?" vendor badge should be on a customer-facing site.
- Whether `/admin/diagnostics` should exist for a non-technical owner, or move behind a flag.
- Whether the event page should have more than one sign-up CTA (see §2.3 — there is a documented
  decision against it).
- Whether 97 contact rows should paginate, and what the owner actually does on that screen.

---

## 4. Later intake — reviewer observations, 2026-08-26

Three observations arrived after the measurements, from a reviewer reading the live site. They
are **not** part of the ranked critique and are **not** numbered worklist entries — the ranked
walk still needs the critique. Each was checked against the code and the measurements before
filing. Two of the three need correcting.

### 4.1 Turf vs grass — CONFIRMED, and wider than reported

Reported as an About-page-vs-event-page mismatch. It is five surfaces:

| File | Says |
|---|---|
| `src/app/about/page.tsx:34` | "Quality turf sized for…" |
| `src/app/facility/page.tsx:23,35,41,125-126` | "Quality turf", "Dedicated 7v7 turf fields", "Professional-grade turf", "No metal cleats on turf" |
| `src/app/events/[slug]/page.tsx:75-76,115-116` | "Real grass field" / "Natural turf under the lights" — visible body copy |
| `src/app/events/[slug]/page.tsx:239,241` | "Real grass field…" — **the metadata description fallback, not body copy** |
| `src/app/layout.tsx:42,59` | "Quality grass field" — OG/Twitter description |

**The part that was not previously noticed:** `:239,241` is the OG description used when an event
has no description of its own. So the contradiction **propagates into WhatsApp and iMessage link
previews** — which matters more here than it would elsewhere, because this community runs on
WhatsApp. A player sharing an open-play night pushes "Real grass field" into the chat while the
About page they land on says turf.

Also worth noting: "Natural turf under the lights" (`:76`) is self-ambiguous. *Natural turf*
means grass, but sitting beside a facility page promising *professional-grade turf* it reads as
the opposite of what it says.

**MECHANICAL** as a code change — these are string edits. The *decision* is the operator's.

**DONE WHEN:** one vocabulary appears in all five locations above, and a `grep -rniE
"turf|grass" src/` shows no two files making opposite claims about the playing surface.

### 4.2 Policy vs flow — CONTRADICTED on the half that was diagnosed

The claim: Terms state the one-registration and waiver rules clearly, but the site relies on
players reading policy rather than a guided funnel, and that is why the owner chases people on
match night.

**The one-registration-per-player rule is not policy-only. It is a hard database constraint.**
`registrations_one_live_spot_idx`
(`supabase/migrations/20260815001500_dedupe_registrations_and_guard.sql:85`) rejects a second
live spot with Postgres `23505`, handled at `src/app/api/register/route.ts:180-183`. CLAUDE.md
records the rule that it must surface as *"you're already signed up"*, never a generic error.
Nobody can double-register by failing to read `/terms:37`.

**The waiver is gated too, and it is working.** The running tournament measures "Waiver on file
32" against "Signed up 33" — 97%.

**What actually leaks is money.** The same tile row reads "Signed up 33 / Paid 21 / Still owes
12", with the sub-line "7 bringing cash". Of the 12 outstanding, 7 have deliberately chosen to
pay at the field — that is a payment method, not a funnel failure. **The real match-night chase
list is about 5 people out of 33.**

That reframes the item entirely. The match-night problem is not a policy-reading problem and not
a waiver problem; it is ~5 unpaid players, and the tool for it is the admin roster's payment
view, not a new player-side funnel.

**DONE WHEN:** *cannot be reduced to a checkable page condition.* This is a question about what
the owner physically does at the field on match night, and it needs the operator to describe
that routine before any UI is designed. Stating that rather than inventing a measurement.

### 4.3 Mobile priority — half CONFIRMED, half CONTRADICTED

The claim: the homepage *and* event pages push "Sign up to play" too far below the fold.

**Event detail page — CONFIRMED.** One CTA, 300x44, at **y2565 of a 3990-tall document** at 390:
about 64% down the page (measurements, P3). This is the strongest mobile item in the file.

**Homepage — CONTRADICTED by the measurements.** At 390 the CTA stack sits at **y588.1 in an
844-tall viewport**; "Sign up to play" (342x50.4) occupies roughly y588–638 and is **above the
fold with no scrolling** (measurements, P1).

These must stay separate items. "Fix the mobile signup CTA" as a single entry would send
somebody to rework a homepage that already does the right thing.

One caveat from §3.b: the homepage figure is the one fold measurement taken at a real device
height (844). The event-page figure does not depend on viewport height at all — y2565 is below
any phone fold.

**DONE WHEN (event page only):** at 390, a sign-up control is reachable without scrolling past
the fold — either a second entry point above y844, or the existing CTA made persistent.
**STRUCTURAL** either way, and both collide with the documented single-personalised-CTA decision
in §2.3. That decision has to be re-opened deliberately, not routed around.

---

## 5. Numbered worklist

**Not written.** Requires `docs/ux/critique-2026-08-26.md`. See the status header.

## 6. CLAIMS I COULD NOT VERIFY

**Not written.** Requires the critique. The test to apply is §3.
