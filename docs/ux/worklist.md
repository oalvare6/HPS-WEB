# UX worklist — 2026-08-26

Source material, both filed in this directory:

- [`critique-2026-08-26.md`](critique-2026-08-26.md) — the ranked UI/UX critique (Gemini),
  verbatim. 9 items in 3 tiers, plus 2 clarifying questions.
- [`measurements-2026-08-26.md`](measurements-2026-08-26.md) — the operator's computed
  measurements of the live site at 390/768/1440, verbatim.

**§4 walks the critique in its own ranked order — the numbering is Gemini's, not mine.** Where I
disagree with a placement I have said so inside the item and left the order alone. §5 lists the
claims that did not survive a check against the measurements or the code. §6 answers the two
clarifying questions from the code.

**Read §5 before building anything.** Four of the nine items contain a claim that is wrong,
misattributed, or unsupported, and two of the prescriptions will cause damage if taken
literally.

All of it is reference material. No application code has been changed.

---

## 1. Ground rules for whoever picks this up

- **Live production, tournament running.** Real players, real waivers, real payments. Nothing
  to `main` without review.
- **MECHANICAL vs STRUCTURAL** is the classification the brief asks for. Mechanical = contained
  change to markup or styles, no behaviour change. Structural = changes a flow, a layout
  decision, or what appears where. §4 classifies each item, and says so plainly where I am not
  sure rather than guessing.
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

The general filter: what this evidence base can and cannot decide, independent of any particular
claim. **§5 is the applied result** — the critique's nine items run through this filter. Keep
this section for the next critique, the next reviewer, or your own next idea.

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

## 4. The worklist — the critique in its own order

Rank and title are Gemini's. Everything else is checked against the measurements and the code.

---

### 1. The Buried and Fragmented Signup (Public)

Gemini's rank: 1 of 9. *"This is your biggest failure."*

This is two different problems with two different evidence bases, so it is split. **1a is the
best-evidenced item in the entire critique. 1b rests on a flow Gemini had not traced** — its own
clarifying question asks what those steps are. I traced it; see §6.

#### 1a — The event-page sign-up CTA is below three screens of scroll

**What's wrong:** On an event page at 390 there is exactly one "Sign up to play" control, 300x44,
at **y2565 of a 3990-tall document** — about 64% down, roughly three phone screens past the fold.
Nothing about signing up is sticky and there is no second entry point.

**Who it hurts:** A player on a phone who tapped a WhatsApp link to the event and wants to sign
up. That is the highest-value moment on the public site and the one the operator most wants to
work unattended.

**Type:** STRUCTURAL — it changes what appears where.

**DONE WHEN:** At 390 on `/events/community-cup-fall-2026`, a sign-up control is reachable
without scrolling — either its `getBoundingClientRect().top` is under 844 at `scrollY 0`, or the
control is `position: sticky`/`fixed` and visible at every scroll position. Today: `top` 2565 of
3990.

**Files:** `src/app/events/[slug]/page.tsx:708-717` (the CTA), `src/lib/event-standing.ts` (which
computes its label and target).

**⚠ Read before building:** the *single, personalised* CTA is a documented decision, recorded at
`events/[slug]/page.tsx:328-341` and traceable to the operator's own report — *"it still says
register even though I am registered."* Gemini's prescription is *"make the call-to-action
sticky"*, which is **compatible** with that decision: one control, made persistent. Adding a
*second* CTA higher up is **not**, and would re-introduce the bug that comment describes. Take
the sticky option.

#### 1b — "The three vital steps are disjointed"

**What's wrong:** Claimed: register, waiver and pay are disjointed and rely on players reading
instructions. **Partly false.** Register → waiver is a single automatic redirect
(`window.location.href = data.signUrl`, `RegistrationForm.tsx:270`), not an instruction. What is
genuinely loose: waiver → pay is a separate page reached by a returned URL, and there is a dead
end at `RegistrationForm.tsx:271-274` where the registration is saved but no waiver URL comes
back and the player is told to *"contact us."*

**Who it hurts:** A first-time player mid-signup; and the owner, who inherits anyone the dead end
strands.

**Type:** STRUCTURAL, but **I am not confident this item is real as written** and I am not going
to pretend otherwise. The measurements exercised no write path at all — *"Nothing that writes was
clicked"* — so nothing in the evidence file speaks to this, and the one part I could verify from
code (register → waiver) contradicts the claim.

**DONE WHEN:** *Cannot be reduced to a checkable condition from the material available.* No
measurement covers a submitted form. Before this becomes work, somebody has to walk the real flow
on a phone with a real registration and write down what actually happens. §6 is the code-level
answer and the place to start.

**Files:** `src/components/register/RegistrationForm.tsx:250-283`,
`src/app/register/waiver/[registrationId]/page.tsx`, `src/components/pay/PayPageClient.tsx`,
`src/app/api/register/route.ts`.

---

### 2. Unusable Match-Night Roster (Admin)

Gemini's rank: 2 of 9. *"This destroys Goal 2."*

**What's wrong:** At 390 the roster table is **640px wide inside a 340px wrapper**
(`scrollWidth 672` vs `clientWidth 340`) and scrolls sideways. Columns are Player 178, Team 171,
Waiver 136, Paid 156 — so at rest the owner sees names and teams, and must scroll right to see
**the two things match night is about**: waiver and payment.

**Who it hurts:** The owner, standing outdoors on a phone at kickoff, trying to find who still
owes. This is the screen the whole admin exists for.

**Type:** STRUCTURAL as prescribed (cards instead of a table). But see the cheaper fix below.

**DONE WHEN:** At 390 on an event's Roster tab, waiver status and payment status are readable for
every row with no horizontal scrolling — the roster container satisfies
`scrollWidth === clientWidth` (today 672 vs 340) — **and** every control that changes payment or
waiver state measures at least 44x44. Today: paid toggle 81x26 (Unpaid) / 63x24 (Paid), team
`<select>` 147x29, emergency-contact button 151x26.

**Files:** `src/components/admin/RosterScreen.tsx:617-618` (the `min-w-[640px]` table),
`:680-790` (row controls), `src/app/api/admin/tournaments/[id]/roster/route.ts:229-231` (sort).

**⚠ Two corrections, one of which may save the whole rebuild:**

1. **"Tap targets (like 11x11px buttons)" is misattributed.** There are no 11px controls on the
   roster. The 11x11 ("Make captain", ×31) and 12x12 ("Remove from team", ×32) controls are on
   the **Teams** tab — `src/components/admin/TournamentTeamsPanel.tsx`. The roster's own smallest
   interactive control is 24px tall. Both problems are real; they are on different screens, and
   the 11px one is genuinely worse.
2. **The roster is sorted alphabetically by last name** —
   `a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)`
   (`roster/route.ts:229-231`). Not by who owes. On match night the owner scrolls an alphabetical
   list of 33 hunting for 5 debtors. A sort or default filter on "still owes" is a fraction of the
   cost of abandoning the table — **and a "Still owes money" filter chip already exists**
   (measured, 135.2x32). Try that before committing to a card rewrite.

Also worth knowing before choosing cards: the roster page is already **5284px tall at 390** with
33 rows at 57px. Stacked cards showing "all statuses at a glance" will make it substantially
longer, trading sideways scrolling for a lot more vertical scrolling.

---

### 3. Missing Spanish Support (Public)

Gemini's rank: 3 of 9.

**What's wrong:** There is no Spanish anywhere and no mechanism to add it. Confirmed: no
`next-intl`, no `react-intl`, no locale routing, no translation files. Every date in the app is
hard-coded `toLocaleDateString("en-US")` — 10 call sites.

**Who it hurts:** Spanish-speaking players across the entire conversion path.

**Type:** STRUCTURAL, and by a wide margin the largest build in this list — it touches every page,
plus the DocuSeal waiver templates (`src/lib/waiver-text.ts`, which is **legal text**) and the
Stripe checkout surface.

**DONE WHEN:** *Not reducible to a page measurement as scoped* ("the entire conversion path" is
not a defined set). If scoped to the funnel, a checkable version is: `/register`, the waiver
signing screen and `/pay` render fully in Spanish with no English strings remaining, and the
choice persists across those three pages.

**Files:** app-wide. Entry points: `src/app/layout.tsx` (`lang` attribute is hard-coded `"en"`),
the 10 `toLocaleDateString("en-US")` call sites, `src/lib/waiver-text.ts`.

**⚠ On the ranking — the one placement I would genuinely argue with.** This is ranked above six
items that are measured, and it is the only item in the critique whose premise appears nowhere in
the evidence file. *"Your heavily bilingual audience"* is an assertion; the measurements contain
no language data, no audience data and no analytics. It may well be true — the operator would
know, and if it is true this belongs at the top. But it is ranked third on a claim the evidence
cannot support, ahead of items 4, 5 and 6, which are measured, cheap and certain. **Confirm the
premise before funding the build.**

---

### 4. The Tablet Overflow Break (Both)

Gemini's rank: 4 of 9.

**What's wrong:** At exactly 768 the desktop nav group (`hidden md:flex`) renders while the
mobile menu (`md:hidden`) disappears, and the group does not fit. The document scrolls sideways
by **113px on public pages** (docWidth 881) and **30px on admin pages** (docWidth 798). At 767
there is no overflow at all.

**Who it hurts:** Anyone at a 768-wide viewport — iPad portrait most obviously. Both audiences: it
reproduces on `/`, `/events`, event detail, `/register` and every admin page.

**Type:** STRUCTURAL by the brief's definition — it changes a layout decision about what appears
at which width — though the edit itself is small.

**DONE WHEN:** At width 768, `document.documentElement.scrollWidth === 768` on `/`, `/events`, an
event detail page, `/register` and `/admin`. Today: 881, 881, 881, 881 and 798. **And** 767 still
shows no overflow afterwards — it is clean today and a breakpoint change can break it.

**Files:** `src/components/layout/header-client.tsx:62` (`hidden md:flex`), `:112` (`md:hidden`),
`:151`; `src/components/layout/quick-actions-bar.tsx` (switches its fixed/sticky bars at the same
breakpoint, so it moves with this); `src/components/layout/footer.tsx` (the mailto link was
measured reaching right:798 on admin pages).

**Note:** Gemini's fix — *"retain the mobile menu until horizontal space naturally accommodates
the desktop navigation"* — is the right instinct. The desktop group measures 723px wide on public
pages starting at x=158, so it needs roughly 900px of viewport. `lg:` (1024) is the stock
breakpoint that clears it.

---

### 5. Hidden Admin Navigation (Admin)

Gemini's rank: 5 of 9.

**What's wrong:** At 390 the admin nav's inner row is a horizontal scroller —
`clientWidth 375`, `scrollWidth 526`, so **151px is off-screen**. The sign-out control sits at
**x=472, 82px past the right edge** of the viewport and is reachable only by scrolling that bar
sideways.

**Who it hurts:** The owner on a phone. Signing out of an admin session on a shared or borrowed
phone is a security action, and it is currently hidden.

**Type:** STRUCTURAL if it becomes a proper menu; MECHANICAL if the fix is only to make the
existing controls reachable.

**DONE WHEN:** At 390 the admin nav satisfies `scrollWidth === clientWidth` (today 526 vs 375),
sign-out is visible without horizontal scrolling, **and** the sign-out control reports a non-empty
accessible name at every width.

**Files:** `src/components/admin/AdminShell.tsx:57-115`.

**⚠ A defect Gemini missed, in the same control.** Below 640 the Log out button renders icon-only
via `<span className="hidden sm:inline">Log out</span>` and carries **neither `aria-label` nor
`title`** — so on a phone it has **no accessible name at all**. It is a 38x26 unlabelled button
that signs you out. This is the one unambiguous accessibility defect in the admin shell and it
costs one attribute to fix. Do it with this item.

---

### 6. Broken Edge Cases (Public)

Gemini's rank: 6 of 9. **These are the cheapest wins in the critique and I would rank them
higher** — two contained bugs, both fully measured, no design decisions required. Order preserved
as asked.

#### 6a — `/pay` promises an event list it never renders

**What's wrong:** Signed out with no event in context, `/pay` renders *"Open the payment page from
your event's page so we can match your registration, **or pick an event below**."* Nothing is
below it. The only control on the page is a single "View events" button (136.1x50.4). Re-measured
after an extra 2.5s wait — still nothing.

**Who it hurts:** A player who reached `/pay` directly, most likely from a WhatsApp message or a
saved link. They are told to do something the page does not let them do.

**Type:** MECHANICAL either way. Cheapest correct fix is deleting five words; rendering a real
list is a small feature.

**DONE WHEN:** `/pay` signed out with no event either renders a list of payable events, or no
longer contains the string "pick an event below". Not both states, and not neither.

**Files:** `src/components/pay/PayPageClient.tsx:49-56`.

#### 6b — The homepage's fixed bar covers the footer's legal links

**What's wrong:** At 390 the fixed quick-actions bar occupies **y771–844**. Scrolled fully to the
bottom of `/`, the footer's legal row (About / Contact Us / Privacy / Terms / Refunds / Cookies)
sits at **y776–796** — underneath it. `body` and `main` both have `padding-bottom: 0`. The
copyright line just above (y692–732) is clear; it is specifically the six legal links that are
unreachable.

**Who it hurts:** Any mobile visitor trying to reach Privacy, Terms or Refunds — the three a
player looks for after paying, and the ones you least want unreachable on a site taking money.

**Type:** MECHANICAL.

**DONE WHEN:** At 390, scrolled to maximum scroll on `/`, every footer link's
`getBoundingClientRect().bottom` is above 771. Today six of them are not.

**Files:** `src/components/layout/quick-actions-bar.tsx` (the `md:hidden fixed bottom-0` block),
`src/app/page.tsx`.

**⚠ Do not follow the prescription literally.** Gemini says *"add proper bottom padding to the
homepage container."* Commit `702be9f` deliberately **removed 11 dead bottom spacers** from pages
that never had a bar over them. The bar renders on the homepage only, so any padding must be
scoped to the homepage only — re-adding a global spacer would undo that cleanup and put dead
space back on twelve pages.

---

### 7. Low Contrast & Small Targets (Both)

Gemini's rank: 7 of 9. Two separate problems; splitting them because one is safe and one is not.

#### 7a — Contrast

**What's wrong:** Muted body text computes to **3.5:1** (`#71717a` on `#0f1d33`) in helper lines
across the admin and the public site, and the footer's legal row and copyright to **3.9:1**
(`#71717a` on `#07111f`). Both fail WCAG AA's 4.5:1 for body text.

**Who it hurts:** Everyone; disproportionately the owner reading a phone outdoors at a floodlit
field, and anyone with low vision.

**Type:** MECHANICAL — these are token swaps in markup.

**DONE WHEN:** No text on the measured screens computes below 4.5:1 against its resolved
background. Specifically: the footer legal row and copyright (3.9:1 today), the helper sub-lines
under section headings (3.5:1), and the separator characters on `/admin/tournaments` (**2.4:1**).

**Files:** `src/components/layout/footer.tsx:122-142`; `src/app/admin/tournaments/page.tsx` (both
the sub-line and the separators); then a sweep of `text-zinc-500` / `text-zinc-600` across `src/`.

**⚠ Gemini understated this.** 3.5:1 is not the floor. The count-line separators on
`/admin/tournaments` are `#52525b` on `#07111f` = **2.4:1**, which is the worst contrast measured
anywhere on the site and is close to invisible outdoors.

#### 7b — Touch targets

**What's wrong:** At 390 on the admin overview, **85 of 91** interactive elements are under 44px
in at least one dimension; on the roster, **111 of 120**; on the Teams tab at 1440, **110 of 113**.

**Who it hurts:** The owner on a phone at the field.

**Type:** Mixed, and that is the problem — see the warning.

**DONE WHEN (scoped):** Every control that *changes state* measures at least 44x44 at 390.
Named and measured today: paid toggle 81x26 / 63x24; team `<select>` 147x29; emergency-contact
button 151x26; event-row controls 28x28 (×25, including "Delete this event permanently"); Teams
tab "Make captain" 11x11 (×31) and "Remove from team" 12x12 (×32); admin sign-out 38x26; roster
toolbar buttons 31x31.

**Files:** `src/components/admin/RosterScreen.tsx`, `src/components/admin/TournamentTeamsPanel.tsx`,
`src/app/admin/tournaments/page.tsx:374-447`, `src/components/admin/AdminShell.tsx`.

**⚠ Do not enforce 44px globally.** Gemini's prescription is *"enforce a 44px minimum hit area
globally."* At 1440, **149 of 156** interactive elements on the admin overview are under 44px in
one dimension — and most of them are **inline text links inside table rows** (player-name links
measure 84.1x17 to 182.2x17). Forcing 44px on those would inflate every table row by ~2.5x and
destroy the density of the screens the owner uses at a desk, to fix a touch problem that does not
exist with a mouse. Scope the rule to controls that mutate state, on touch-sized viewports. Note
also that 44px is the Apple HIG / WCAG AAA figure; WCAG 2.2 AA's Target Size (Minimum) is 24x24
with exceptions, which several of these already pass.

---

### 8. Developer Jargon (Admin)

Gemini's rank: 8 of 9.

**What's wrong:** `/admin/diagnostics` is written in environment variables, JWTs, SDK versions,
dashboards, repository names and file paths — it tells the owner to *"see docs/AUTH-CONFIG.md in
the repository."* Every other admin screen is in plain English.

**Who it hurts:** The owner. Per `CLAUDE.md` the admin is being handed to a non-technical company
owner, and simplicity for that person outranks cleverness everywhere. This page is the exception
to that rule.

**Type:** STRUCTURAL — the honest fix starts with deciding who the page is for.

**DONE WHEN:** No visible text on `/admin/diagnostics` contains "JWT", "Supabase", "SDK", "env",
"anon key", "service-role", or a repository file path; every row states what is wrong and what to
do about it in plain English. **And** the failing check named below is either passing or explains
itself in one sentence.

**Files:** `src/app/admin/diagnostics/page.tsx`, `src/app/api/admin/diagnostics/auth/route.ts`.

**⚠ Two things before building the green/red dashboard.** First, the page already *has* OK / Fail
/ "Verify in dashboard" states — the defect is the vocabulary around them, not a missing status
system, so this is a rewrite rather than a new feature. Second, and more important: **one check
is currently failing.** "Supabase project responds (auth health)" reads Fail —
*"Could not reach Supabase auth health endpoint"* — and the Environment block reports "Auth
health reachable: no". A simple green/red dashboard shipped today shows the owner a **red light
on day one** with no way to act on it. Triage that check as part of this item, or the redesign
hands a non-technical owner an alarm they cannot answer.

---

### 9. Contradictory Copy (Public)

Gemini's rank: 9 of 9.

**What's wrong:** The site contradicts itself about its own playing surface. Confirmed, and it is
wider than the critique states — **five surfaces, not two**:

| File | Says |
|---|---|
| `src/app/about/page.tsx:34` | "Quality turf sized for…" |
| `src/app/facility/page.tsx:23,35,41,125-126` | "Quality turf", "Dedicated 7v7 turf fields", "Professional-grade turf", "No metal cleats on turf" |
| `src/app/events/[slug]/page.tsx:75-76,115-116` | "Real grass field" / "Natural turf under the lights" — visible body copy |
| `src/app/events/[slug]/page.tsx:239,241` | "Real grass field…" — **the OG/link-preview description fallback** |
| `src/app/layout.tsx:42,59` | "Quality grass field" — site-wide OG/Twitter description |

**Who it hurts:** A player deciding what boots to bring, and anyone forming a first impression.
Cleats are the practical edge: `/facility` says "No metal cleats on turf" while the event page
says "Cleats required" on a "real grass field" — a player can follow both and still turn up with
the wrong footwear.

**Type:** MECHANICAL as a code change (string edits). The decision is the operator's — nobody but
you knows which is true.

**DONE WHEN:** One vocabulary appears in all five locations above, and
`grep -rniE "turf|grass" src/` shows no two files making opposite claims about the surface.

**Files:** the five in the table.

**⚠ The part the critique missed:** `events/[slug]/page.tsx:239,241` is the **OG description
fallback**, used when an event has no description of its own. So the contradiction propagates
into **WhatsApp and iMessage link previews** — which matters here more than it normally would,
because this community runs on WhatsApp. A player sharing an open-play night pushes "Real grass
field" into the group chat, and the About page they land on says turf. Also note "Natural turf
under the lights" is self-ambiguous: *natural turf* means grass, but beside "professional-grade
turf" it reads as its opposite.

---

## 5. CLAIMS I COULD NOT VERIFY

The critique was written from descriptions, not screenshots and not the codebase. This section is
the audit. Blunt, as requested — I would rather you drop items here than build them.

### 5.a Contradicted by a number in the measurements

These are wrong, not merely unsupported.

1. **"On mobile, the only 'Sign up' button is buried thousands of pixels down the page."** (item 1)
   True on **event detail pages** (y2565 of 3990 at 390) and that item is sound. **False as a
   statement about the site.** On the homepage at 390 the CTA stack sits at **y588.1 in an
   844-tall viewport** — "Sign up to play" (342x50.4) is above the fold with no scrolling. `/events`
   also carries a "Sign up to play" (292x44) on 2 of its 5 entries. Keep item 1a scoped to event
   detail pages; a sweep across "mobile" would rework a homepage that is already correct.

2. **"Tap targets (like 11x11px buttons)"** attributed to the roster. (item 2)
   No 11px control exists on the roster. Its smallest interactive elements are the paid toggle
   (63–81 x 24–26), the team `<select>` (147x29) and the emergency-contact button (151x26). The
   11x11 and 12x12 controls are on the **Teams** tab. Both problems are real; the example is
   filed under the wrong screen, and the genuinely worst offender is not where the item points.

3. **"The three vital steps … [rely] on players reading instructions to complete the process."**
   (item 1) Register → waiver is **one automatic redirect**, not an instruction:
   `window.location.href = data.signUrl` at `RegistrationForm.tsx:270`. See §6. The claim is
   false for that hop; the waiver → pay hop is the only part that is arguably loose.

4. **"Add proper bottom padding to the homepage container."** (item 6) The prescription conflicts
   with `702be9f`, which deliberately removed 11 dead bottom spacers. Correct as a homepage-scoped
   fix; wrong if applied globally.

5. **"Enforce a 44px minimum hit area globally."** (item 7) At 1440, 149 of 156 interactive
   elements on the admin overview are under 44px in one dimension, and most are inline text links
   inside table rows (84.1x17 to 182.2x17). Applied globally this destroys admin table density on
   desktop to solve a touch problem that does not exist there.

### 5.b Rests on something the measurements do not contain

Not necessarily false — but nothing in the evidence file supports them, so do not treat them as
established.

6. **"Your heavily bilingual audience."** (item 3) The measurements contain no language data, no
   audience data and no analytics of any kind. This is the sole premise under the third-ranked
   item and the largest build proposed. **You are the only person who can confirm it.** If it is
   true, the item is probably ranked too low rather than too high. If it is assumed, the item
   should not be third.

7. **"Directly sabotaging conversions"; "causing drop-offs"; "triggering the manual chasing."**
   (framing, items 1 and 3) There is no conversion data, funnel data or analytics in the
   measurements. The one place the evidence speaks to chasing, it points elsewhere — see 5.d.

8. **"Outdoors on a phone … for a standing, moving user"; "players reading outdoors in the
   glare."** (items 2 and 7) Entirely plausible and probably the right mental model, but no
   outdoor, glare, one-handed or real-device testing exists. Every measurement came from a
   desktop browser at simulated widths. Treat as an assumption you are choosing, not a finding.

9. **Everything about the register → waiver → pay experience.** (item 1) The measurements state
   *"Nothing that writes was clicked — no payment toggles, no waiver modal, … no form
   submissions."* The entire write path — every error state, every validation message, the whole
   payment flow — is unmeasured. Roughly half the site's real risk surface is invisible to this
   evidence file.

### 5.c Judgments no measurement can settle — route to the operator, not to code

10. **"This is your biggest failure" and the ranking itself.** A priority order is a claim about
    your goals and your costs, not about the page. Only you can rank these. My one substantive
    disagreement is recorded in item 3 and in the note on item 6.

11. **Whether stacked cards beat a table on match night.** (item 2) Measurable facts: 33 rows,
    57px each, page already 5284px tall at 390. Cards showing "all statuses at a glance" trade
    sideways scrolling for considerably more vertical scrolling. Which is better for someone
    standing at a field is a judgment — and it may be moot if sorting by "still owes" solves the
    actual job.

12. **Whether the surface is turf or grass.** (item 9) The code cannot know. You can.

13. **Whether `/admin/diagnostics` should exist for a non-technical owner at all**, or move behind
    a flag. (item 8) Rewriting the vocabulary assumes the page should stay.

14. **Every aesthetic claim, by construction.** The critique was written from descriptions and
    there are no screenshots in evidence. Nothing about how the site *looks* — hierarchy,
    crowding, balance, polish — can be checked against this material. Worth noting the critique
    largely avoided this trap; it stayed on structure and measurable properties.

### 5.d One thing the critique missed, which the numbers point at directly

The stated goal behind items 1 and 2 is to stop the owner chasing people on match night. The
measurements localise that problem more precisely than either item does.

For the running tournament: **Signed up 33 · Paid 21 · Still owes 12**, with the sub-line
**"7 bringing cash"**, and **Waiver on file 32**.

- Waivers are **not** the leak — 32 of 33 is 97%.
- Duplicate registrations are **not** the leak — `registrations_one_live_spot_idx`
  (`supabase/migrations/20260815001500_dedupe_registrations_and_guard.sql:85`) makes a second live
  spot impossible at the database level, handled at `api/register/route.ts:180-183`.
- Of the 12 outstanding, **7 have deliberately chosen to pay cash at the field**. That is a
  payment method, not a funnel failure.

**The real match-night chase list is about 5 people out of 33.** That is an argument for item 2
being about *sorting and filtering* — surfacing those 5 — rather than a card rewrite, and an
argument that the funnel consolidation in item 1b is aimed at a leak the numbers do not show.

---

## 6. Gemini's clarifying questions, answered from the code

### Q: What exact interactive steps occur between submitting the registration form and reaching the waiver?

**One automatic redirect, or none.** There is no interactive step in between.
(`src/components/register/RegistrationForm.tsx:236-283`)

1. The form POSTs to `/api/register`.
2. The response carries `signUrl`, `waiverSkipped`, `waiverSignedAt`, `registrationId`, `payToken`.
3. **If the player already has a valid waiver of the right type on file** — `waiverSkipped &&
   signUrl` — there is **no waiver step at all**. The form renders `ConfirmationCard` in place,
   with the pay URL already loaded. The player never leaves the page.
4. **Otherwise** — `window.location.href = data.signUrl` at `:270`. A hard, full-page navigation
   straight to the waiver. The player takes no action to get there.
5. **If no `signUrl` comes back**, the player sees *"Registration saved, but we couldn't load the
   waiver. Please contact us."* (`:271-274`) — the registration exists, the player is stranded,
   and the owner inherits them. **This is the actual gap in item 1b**, and it is a dead end rather
   than a disjointed step.

Two implications for the "single-flow wizard" in item 1: step 4 is a full page load, so any wizard
would have to survive losing React state at that boundary; and the waiver is hosted by DocuSeal,
so the flow leaves this app regardless of how the UI is arranged.

### Q: How is the admin roster table sorted when the owner opens it on match night?

**Alphabetically by last name, then first name. Nothing else.**
(`src/app/api/admin/tournaments/[id]/roster/route.ts:229-231`)

```js
const rows = [...playerRows, ...guestRows].sort((a, b) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
);
```

There is no secondary sort on payment status, waiver status or team, and no way to re-sort from
the UI. Guests and registered players are interleaved into the same alphabetical run.

So on match night the owner opens a list ordered by surname and scans 33 rows for the ~5 who owe —
while the two columns that would tell them (Waiver, Paid) are off-screen to the right at 390
(see item 2). A "Still owes money" filter chip already exists and is measured at 135.2x32; whether
the owner knows it is there is a separate question, and one worth asking before any rewrite.
