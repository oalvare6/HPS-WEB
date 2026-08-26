# HPS — measured UI observations, 2026-08-26

Raw measurements taken from the live production site (houstonpremiersoccer.com) at
CSS viewport widths 390, 768 and 1440, each page reloaded at each width.

METHOD: driven from a second browser window sized so documentElement.clientWidth read
exactly 390 / 768 / 1440 with the scrollbar suppressed, so CSS layout width and
media-query width both matched the stated number; media-query state was verified at
each width. Viewport height was 844 at 390; the screen capped the window at ~900 tall,
so the 768 and 1440 passes ran at ~900 rather than 1024/900+.

Every number here was read off the page as a computed value — getComputedStyle,
getBoundingClientRect, naturalWidth/naturalHeight, scrollWidth vs clientWidth. Contrast
ratios were computed from the resolved foreground colour, alpha-blended where the text
colour was translucent, against the nearest opaque ancestor background. Nothing was
estimated. Anything unmeasurable is marked "not measured".

The admin half was captured while signed in as the owner; the public half signed out of
both the admin and the player account. Nothing that writes was clicked — no payment
toggles, no waiver modal, no add/delete/reorder/feature controls, no merge, no
third-party sync, no exports, no form submissions.

Personal data is redacted: names, emails, phones, dates of birth, per-person amounts,
Stripe identifiers and event UUIDs do not appear.

These are observations only. No judgments, no rankings, no recommended fixes — that is
what the critique document is for. Use this file to check any claim in the critique
against the number it rests on.

---

# A1 /admin (Overview) — signed in

## MOBILE css 390x844
- doc 390x4776, no horizontal overflow. body bg #07111f, <html class="dark">.
- TWO stacked bars: public site header (sticky, h=64, contains logo link 40x40, status pills, hamburger 40x40 "Toggle menu", account chip "Omar" 78.5x34) THEN admin nav (h=57, y65): wordmark "Admin" + Overview / Events / People / Site. "View site" and "Log out" not visible at this width in the nav row (they sit in the collapsed public menu).
- Above fold, in order: public header (y0 h64) > admin nav (y65 h57) > hero section (y122 h192.8: h1 "Overview" + subline "$X collected by card - N card payments") > h2 "YOUR EVENTS" (y346.8 h20) > one event card (y382.8 h175.4) > <details> "Past events (4)" (y574.2 h20) > h2 "MONEY" (y634.2) > stat cards 2x2 grid (y678.2 h120 two across; y814.2 h104 two across).
- TYPE: h1 30/36 Bebas Neue w700 ls-0.75px #ffffff on #07111f 18.9:1. Stat numbers 24/32 Inter w700 (#22d3ee 9.3:1, #ffffff 16.9:1, #facc15 11:1, #f87171 6.1:1). Card h3 16/24 Inter 600 #fff 16.9:1. Hero subline 16/26.4 Inter 400 #a1a1aa 7.4:1. Section h2 14/20 Bebas Neue w600 UPPERCASE ls0.35px #a1a1aa on #0f1d33 6.6:1. Admin nav links 14/20 w500: active #ffffff on #172a44 14.5:1, inactive #a1a1aa on #07111f 7.4:1. Table th 14/20 w500 #a1a1aa 6.6:1; table name links 14/20 w500 #ffffff 16.9:1; amounts 14/20 w600 #ffffff. Card meta 14/20 #a1a1aa 6.6:1; counts line 14/20 #d4d4d8 11.4:1 with inline #facc15 (11:1) and #f87171 (6.1:1) spans. Stat labels 12/16 UPPERCASE ls0.3px #a1a1aa 6.6:1. Status pill "Paid" 12/16 w500 #22d3ee on #0f1d33 9.3:1. Event status pill "Open" 12/16 w500 #4ade80 9.7:1.
- FOOTER type: body 14/22.75 #a1a1aa 7.4:1; "QUICK LINKS" h3 14/20 UPPERCASE ls0.35px #d4d4d8 12.8:1; legal row links 14/20 #71717a on #07111f = 3.9:1; copyright 14/20 #71717a 3.9:1.
- PAYMENTS TABLE at 390: 3 visible columns — Player 165px, Amount 85px, Status 91px. Email / Event / Date columns are not rendered at this width. 60 body rows, all rendered (no pagination visible). Table width 340 = wrapper width; wrapper has overflow-x:auto but is not scrolling (scrollWidth == clientWidth). Cell padding 12px 16px.
- TAP TARGETS: 91 interactive elements in the DOM tree at this width; 85 are under 44px in at least one dimension. Examples: logo link 40x40; hamburger 40x40; account chip 78.5x34; admin nav items 107.4x32, 89.3x32, 89.9x32, 69.8x32; an unlabelled icon button 38x26; "Check Stripe for missed payments" 275.6x34; "Download spreadsheet" 200.6x34; per-row player links 67.8x17 up to 124.8x17 (three wrap to x37); footer links 39.5x20-73.7x20; "Get Directions" 111.8x16; "Join Community Chat" 123.5x16. Full-width targets that are >=44 tall: event card link 342x175.4, footer brand link 342x48.
- MEDIA: 1 raster image (logo) natural 48x46 displayed 36x36, object-fit: fill. Everything else inline SVG (12-24px).
- LOAD: data fetched after mount. During the skeleton phase the page carries 58 elements with .animate-pulse and document height 1892; loaded state is 4776 tall with 4 pulse elements remaining.
- COPY seen: "Overview", "$X collected by card - N card payments", "YOUR EVENTS", "Open", "N signed up - N paid - N still owe - N no waiver", "Open ->", "Past events (4)", "MONEY", "COLLECTED BY CARD", "CARD PAYMENTS", "NOT COMPLETED", "REFUNDED / FAILED", "Check Stripe for missed payments", "Download spreadsheet", column heads "Player / Amount / Status", pill "Paid".

## TABLET css 768x902 (window could not exceed ~902 tall; height noted as measured)
- doc 798x5462 — HORIZONTAL OVERFLOW of 30px at exactly 768.
- BREAKPOINT BEHAVIOUR measured by stepping the width: at css 767 the header is 65px tall, the hamburger is 40x40 and there is no horizontal overflow (docW = 767). At css 768 the hamburger drops to 0x0, the desktop nav group (`hidden md:flex`, 638px wide) appears and its right edge lands at 796 — 28px past the viewport — the header grows to 81px tall, and documentElement.scrollWidth becomes 798. A footer anchor (the mailto link, 210px wide) also reaches right:798. So the body scrolls sideways ~30px at exactly this width; the account chip ("Omar", 76.5x20) is the element sitting furthest past the right edge.
- Above the fold: logo link 133.8x84 (y-2) > status pills row (y24 h32) > desktop nav row (y26.8 h26.4: Home About Facility Events Contact + Omar) > admin nav (y81 h57, now showing "HPS Admin" wordmark + 4 links + "View site" + "Log out") > hero (y138 h202.4) > "YOUR EVENTS" (y388.4) > event card (y424.4 h175.4) > "Past events (4)" (y615.8) > "MONEY" (y675.8) > 4 stat cards all on one row (y719.8 h104) > toolbar row (y847.8 h34).
- h1 grows to 36px/40px Bebas Neue ls-0.9px. All other type identical to 390.
- PAYMENTS TABLE at 768: 5 columns — Player 158, Email 261, Amount 85, Status 91, Date 123 (total 718). The "Event" column is still not rendered. Wrapper 718 wide, not scrolling.
- Tap targets: 96 interactive, 88 under 44px in one dimension. Header nav links 39.4x20 to 53.4x20; account chip 76.5x20; admin nav items 107.4x32 / 89.3x32 / 89.9x32 / 69.8x32 / "View site" 105.1x32 / "Log out" 94.6x32; "HPS Admin" wordmark link 99.8x52.8.
- "Past events (4)" summary is a 720x20 target.

## DESKTOP css 1440x900
- doc 1440x4154, no horizontal overflow.
- Above the fold identical in order to 768; logo link 271.6x48 at y16, admin nav y81 h57, hero y138 h202.4, "YOUR EVENTS" y388.4, event card y424.4 h155.4, "Past events (4)" y595.8, "MONEY" y655.8, four stat cards y699.8 h104, toolbar y827.8 h34, table starts y886.8 and is 2805 tall.
- Container: main is 1440 wide with 0 padding; the inner well is 1104 wide (max-w-6xl 1152 less 24px of side padding each side).
- Section rhythm: hero section padding 64px top / 64px bottom; the content section below it uses 48px top / 48px bottom.
- Event cards grid: 2 columns of 544px, 16px gap. Stat cards: 4 columns of 264px, 16px gap. Footer: 4 columns of 252px, 32px gap.
- Card style measured: 20px padding, 12px radius, 1px border rgba(30,47,77,0.6), background rgba(15,29,51,0.9), backdrop-filter blur(4px), and box-shadow computed as rgba(0,0,0,0) 0 0 0 0 — i.e. no visible shadow on these cards.
- No position:fixed elements on this screen at any width.
- Payments table at 1440: 6 columns — Player, Email, Event, Amount, Status, Date. Player links 84.1x17-182.2x17.
- Tap targets: 156 interactive, 149 under 44px in one dimension. "HPS Admin" wordmark 106.6x26.4; the four admin nav links 107.4x32, 89.3x32, 89.9x32, 69.8x32; "View site" 105.1x32; "Log out" 94.6x32; toolbar buttons 275.6x34 and 200.6x34; "Past events (4)" summary 1104x20.

## PAST EVENTS (expanded read-only)
4 cards, each "Finished": an August open-play night, a June-July 7v7 tournament, a spring tournament, and a May open-play night. Each card repeats the same shape as the live one: title, "Finished" pill, date range, "N signed up - N paid - N still owe" (no "no waiver" segment on these), and an "Open" link.

---

# A2 /admin/tournaments — "Events"

## Structure (same at all widths)
h1 "Events" + a one-line count string "3 tournaments-2 open play nights-3/3 featured on homepage"; a primary "Add event" button; then section "Tournaments" with sub-line "Seasons with teams, a schedule and a league table." and a table of 3 rows; then section "Open play nights" with sub-line "One-off pop-up nights. One date, one door price, no teams." and a table of 2 rows. Table columns: Image, Title, Format, Dates (or "Date" on the open-play table), Status, Actions.

## Per-row controls (5 per row, each exactly 28x28, icon only, no visible text and no aria-label; the only accessible name is a title attribute)
- "Unfeature on homepage" — button, icon colour #22d3ee
- "Move up" — button, #a1a1aa, disabled on the first row
- "Move down" — button, #a1a1aa
- "Event settings" — link, #a1a1aa
- "Delete this event permanently" — button, #a1a1aa
20 buttons + 5 links = 25 such 28x28 controls on this screen.

## MOBILE css 390x844
- doc 390x2039, no body overflow.
- Order: header 64 > admin nav 57 > title block y170 h96.8 > "Add event" y282.8 (143.7x50.4) > "Tournaments" heading block y413.2 h38 > table y464.2 h314 > "Open play nights" y811.2 > sub-line y833.2 > second table.
- BOTH tables overflow their wrapper and scroll sideways: table 513 wide inside a 340 wrapper (overflow-x:auto), and 494 inside 340. Format and Dates columns render at 0 width; visible columns are Image 112, Title 113, Status 100, Actions 188. The Actions column (188px of the 340 visible) is what pushes Title down to 113px.
- Row heights 85 / 85 / 85 / 165 / 105 — two rows are 1.5-2x taller than the rest.
- 54 interactive elements, 47 under 44px in one dimension.
- Type: h1 30/36 Bebas Neue; "Add event" 16/26.4 w700 #ffffff on #0e7490 = 5.4:1; count line 16/26.4 #a1a1aa 7.4:1 with "3/3 featured on homepage" in #22d3ee 10.5:1 and the "-" separators in #52525b on #07111f = 2.4:1; section h2 14/20 Bebas Neue w600 ls0.84px #ffffff 16.9:1; section sub-line 12/16 #71717a on #0f1d33 = 3.5:1; th 14/20 w500 #a1a1aa 6.6:1.

## TABLET css 768x900
- doc 798x1422 — the same 30px body overflow from the public header described in A1.
- "Add event" moves up to sit on the title row (title block y202, button y226).
- Tables now fit: 718 wide in a 718 wrapper, no sideways scroll. Columns Image 112, Title 182, Format 136, Status 100, Actions 188; the Dates column is still 0 width.
- Row heights 65 / 65 / 65 / 59.5 / 59.5.
- 59 interactive, 50 under 44px.

## DESKTOP css 1440x900
- doc 1440x1394, no overflow.
- Tables 1102 wide in a 1102 wrapper. All six columns present: Image 112, Title 266, Format 206, Dates 229, Status 101, Actions 189 (tournaments); Image 112, Title 328, Format 107, Date 246, Status 107, Actions 201 (open play).
- Row heights 60 / 60 / 60 / 59.5 / 59.5.
- 59 interactive, 51 under 44px. "HPS Admin" wordmark link 106.6x26.4.

## IMAGES in the Image column
Thumbnails are 78x33 displayed with object-fit:cover. Sources are 80x53, 80x120 and 80x46 natural. Two of the five rows have no image at all (empty cell).

---

# A3 /admin/tournaments/<id> — single event page, ROSTER tab (default, no ?tab= param)
Event observed: the tournament that is currently running.

## MOBILE css 390x844
- doc 390x5284, no body overflow.
- ABOVE THE FOLD, in order: public header (y0 h64) > admin nav (y65 h57) > breadcrumb "Admin / Events / <event name>" (y170 h20) > h1 event name (y202 h36) > meta row 1: date range + "6:55 - 11:00" (y246 h20) > meta row 2: street address + "$80.00" (y270 h20) > pills "Open" and "On homepage" (y306 h24) > four stat tiles STACKED one per row: "SIGNED UP 33" (y410 h90), "PAID (CASH OR CARD) 21 / 33" (y516), "CARD PAYMENTS 18" (y622), "COLLECTED BY CARD $1,440.00" (y728) > the tab row begins at y842 in an 844-tall viewport (h112, so it wraps to more than one line).
- Everything the Roster tab actually contains is below the fold on a phone.
- TABS are <button>s, 32 tall: Roster 86.5, Teams 87.8, Schedule & scores 167.1, Announcements 151.8, Settings 98 (sum 591 against a 340 content width). Active tab #ffffff on #07111f = 18.9:1; inactive #a1a1aa on #172a44 = 5.6:1. 14px.
- ROSTER SUMMARY TILES (below tabs): "Signed up 33", "Paid 21", "Still owes 12" with a sub-line "7 bringing cash", "Waiver on file 32", "No team 1". Numbers 24/32 Inter (w600 ls-0.6px or w700): white 16.9:1, #4ade80 9.7:1, #facc15 11:1. Labels 14/20 w500 #a1a1aa 6.6:1.
- "By team" panel: h3 "By team" 14/20 w600 #ffffff; helper line "Tap a team to filter the list" 12/16 #71717a on #0f1d33 = 3.5:1; then 7 team buttons, each 308x84.1, containing team name (14/20 w500 #ffffff on #172a44 14.5:1), a mono "7/11 paid" (12/16 JetBrains Mono #a1a1aa on #172a44 = 5.6:1; green #4ade80 8.3:1 when 100%), a percentage, and a "N still owes" line. The last is "No team yet" in #facc15 on #172a44 = 9.4:1.
- SEARCH: 308x38, 14px, padding 8px 12px 8px 36px (icon inset), background #172a44, border #1e2f4d, placeholder "Search name, phone or team".
- FILTER CHIPS, all 32 tall: "Everyone" 86.1, "Still owes money" 135.2, "Paying cash" 104.3, "No waiver" 90.6, "No emergency contact" 174.8, "No team" 79.8.
- TOOLBAR icon buttons, 31x31 each, title attributes only: "Refresh", "Check DocuSeal for signed waivers and do...", "Download this roster as a spreadsheet". Plus "Add walk-in" 156.7x50.4, 16/26.4 w700, #ffffff on #0e7490 = 5.4:1.
- ROSTER TABLE: 640 wide inside a 340 wrapper, scrollWidth 672 — it SCROLLS SIDEWAYS at this width. Columns Player 178, Team 171, Waiver 136, Paid 156. 33 body rows, row height 57, cell padding 10px 12px 10px 1px (1px on the left).
- PER-ROW CONTROLS: a team <select> 147x29 whose options are "- No team -" plus the six team names; a paid toggle rendered as a button — label "Unpaid" 81x26 with title "Mark as paid", or label "Paid" 63x24 with title "Mark as not paid"; a waiver cell that is a plain <span> reading "to May 26, 2027" (100-110 x16) with title "Good through May 26, 2027"; and, on rows that need it, a 151x26 button labelled "No emergency contact" with title "No emergency contact on file - nobody to call if they get hurt. Click to add one."
- A secondary line under each player name is 12/16 #71717a on #0f1d33 = 3.5:1 (33 instances).
- 120 interactive elements; 111 under 44px in at least one dimension. Smallest text on interactive controls measured at 10px and 11px.

## TABLET css 768x900 (roster tab)
- doc 798x4261 — same 30px body overflow from the public header.
- Order: header 84 > admin nav y81 h57 > breadcrumb y202 > h1 y234 h40 (36px) > meta spans all on ONE row y282 (date, time, address, price) > pills y318 > event stat tiles 2x2 (y454 h90 x2, y560 h90 x2) > tab row y674 h40 (single line, no wrap, no scroll) > roster summary tiles 3 across (y738 h106.1) then 2 across (y856.1 h86).
- Roster table 686 wide in a 718 wrapper — no sideways scroll. Columns Player 206, Team 171, Waiver 154, Paid 156. Row height 57.
- Grids: event stats 2 cols of 352 gap 16; roster summary 3 cols of 232 gap 12; team panel 2 cols of 339 gap 8.

## DESKTOP css 1440x900 (roster tab)
- doc 1440x3749, no overflow.
- The "Open" and "On homepage" pills move up onto the title row (both at y234, same as h1).
- Event stat tiles are 4 across (all y414 h90). Tab row/Roster tab at y532. Roster summary tiles 5 across, 211px each, gap 12.
- Roster table 1070 wide in a 1102 wrapper. Columns Player 372, Team 225, Waiver 269, Paid 204. Row height 57.
- Team panel 2 cols of 531, gap 8.
- 120 interactive elements at 390; 113 on the Teams tab at 1440.

# TEAMS tab (?tab=teams)
- Header line "6/8 teams" and a "New team" button.
- Six team cards: team name, "N members", "Captain: <name>" or "No captain set", then the member list. Then an "UNASSIGNED (1)" block listing one entry (a name plus an email) with an "Assign" button.
- Controls and sizes at 1440: "Edit team" 22x22 (x6), "Delete team" 22x22 (x6), "Make captain" 11x11 (x31), "Remove from team" 12x12 (x32), "Remove captain" 11x11, "Assign" 72.3x26, "New team" ~130x44.
- Grid: 3 columns of 357.3, gap 16 at 1440.
- 113 interactive elements, 110 of them under 44px in one dimension.

# SCHEDULE & SCORES tab (?tab=schedule)
- Section 1 eyebrow "SCHEDULE" with help text: "Add rounds, matchdays, or sessions for this tournament. Public schedule on the detail page follows this order." Then "Add round" (130.4x44).
- One round exists: "Round 1", pill "SCHEDULED", "Fri, Aug 21, 2026 - 7:00 PM - 10:05 PM". Round controls 26x26 each: "Move up", "Move down", "Edit", "Delete" (4 of each).
- Section 2 eyebrow "MATCHES & SCORES" with help text: "Fixtures, results, and goal scorers. Standings and the top-scorer leaderboard on the public page are calculated from completed matches." Then "Add match" (136.4x44).
- Three matches listed as rows "#1 <team> vs <team> SCHEDULED"; each whole row is a button 876x20.
- 56 interactive elements, 52 under 44px.

# ANNOUNCEMENTS tab (?tab=updates)
- Eyebrow "PUBLIC UPDATES", help text: "Post short updates that show on the public tournament page (e.g. "Bracket released", "Round 3 moved to Field 2"). Pin one to the top."
- A textarea with placeholder "Write an update for players...", a "Pin to top" checkbox rendered 16x16, a counter "500 chars left", a "Post update" button 144.4x44.
- Empty state: "No updates posted yet" followed by "Post schedule changes or announcements - pinned updates show on the public tournament page."

# SETTINGS tab (?tab=settings) — viewed only, nothing typed or saved
Field order and wording, top to bottom:
- EVENT STATUS. "Event status*" with four choices spelled out in plain English: "Draft - hidden from the public", "Open - taking sign-ups and payments", "Closed - on the site, but not taking money", "Cancelled - called off". Below it a live explanation of the current choice: "The event is on the site, people can sign up and pay." Then "Show on homepage" with help "Up to 3 events at a time."
- BASIC INFO. "Event type*" as two described options: "Tournament - A season with teams, a schedule and a league table. Players join a team and pay an entry fee." and "Open play night - A one-off pop-up night. One date, one door price, no teams and no standings." Then "Tournament Title*", "Format*" (Adult 7v7 / Youth 7v7 / Mixed 7v7 / Adult 5v5 / Youth 5v5 / Other), "Description".
- DATES & TIMES. "Start Date*", "End Date", "Recurrence Pattern" with help "e.g. Every Friday starting Mar 27", "Time Start*", "Time End*", "Location".
- PRICING & SIZE. "Entry fee (USD)", "Max Teams", "Offer guest / single-round tier on pay page" with help "Only the Entry Fee tier will show on /pay for this event."
- BANNER IMAGE. "Upload Image" / "Choose Preset" with eight named presets: Field at Night, Stadium Night, Match Action, Team Huddle, Youth Training, Trophy Celebration, Aerial Field View, Soccer Field. Then "PREVIEW" with the note "Same wide banner crop as the public event page (16:7)."
- ADVANCED, described as "Web address and list order. You almost never need these."
- Footer actions: "Save event" and "Cancel".

## Cross-cutting admin shell facts (measured at 390)
- The admin nav is sticky at top:0 with z-index 40, background rgba(7,17,31,0.95), 1px bottom border #1e2f4d. The PUBLIC header above it is also sticky at top:0 with z-index 50 and is 65px tall. Two stacked sticky bars, the higher z-index one being the public site header.
- The admin nav's inner row is a horizontal scroller at 390: clientWidth 375, scrollWidth 526 (overflow-x: auto). 151px of it is off-screen.
- At 390 the "View site" link is not rendered at all (it appears from 640 up). The "Log out" control collapses to an icon-only button 38x26 with no aria-label and no title attribute, positioned at x=472 — 82px beyond the right edge of a 390 viewport, reachable only by scrolling that nav sideways.
- The wordmark reads "Admin" below 640 and "HPS Admin" from 640 up.
- Stat card grid at 390 is 2 columns of 155.5, gap 16.
- Teams tab at 390: team cards go to a single 342px column; control sizes are unchanged from desktop (Edit team 22x22, Delete team 22x22, Make captain 11x11, Remove from team 12x12).
- Schedule tab at 390: round controls unchanged at 26x26; "Add round" 133.4x44.
- Settings tab at 390: every field control is 292 wide (selects 292x48, text inputs 292x52, textarea 292x105, date inputs 292x54).
- Create-event form at 390: same 292-wide controls; the two event-type option buttons become 292x117 and 292x97.
- LOADING: admin data screens do fetch after mount and do render skeletons. On the connection used, the skeleton phase was very short — polling every 100ms, the roster/contacts data was present within roughly 100-400ms of the new document rendering; at one sample 58 elements carried .animate-pulse, and the loaded state keeps 4. Duration on a slow phone connection was not measured.

---

# A3b — other events, for comparison
- A COMPLETED tournament: same five tabs (Roster / Teams / Schedule & scores / Announcements / Settings). Roster has 50 rows; at 1440 the columns are Player 465, Team 211, Waiver 266, Paid 128. A line under the table reads "Showing 50 of 50." Team names on that event are country names. Summary tiles read "nobody yet" where a team has no members, and a "No team yet" bucket reads "19/40 paid / 48% / 21 still owes".
- An OPEN PLAY NIGHT: only FOUR tabs, and the first is renamed — "Who's coming" (138.7x32) instead of "Roster"; there is no "Teams" tab. The table drops the Team column (Player / Waiver / Paid). The filter chips drop "No team" (Everyone / Still owes money / Paying cash / No waiver / No emergency contact). The summary strip above still shows five tiles including "No team 1" on an event that has no teams. Footer line "Showing 1 of 1." Header meta reads "7:00 PM - 9:00 PM" and "$10.00", pills "Finished" and "On homepage".
- Time formatting differs between events: the running tournament shows "6:55 - 11:00" with no AM/PM, the open play night shows "7:00 PM - 9:00 PM", and the schedule round shows "7:00 PM - 10:05 PM".

# A4 /admin/tournaments/new — create event (viewed only, nothing typed, nothing saved)
- doc 1440x3384 at desktop, no overflow. Same section order as the Settings tab, with two differences: the contextual help under "Event status" reads "Only you can see this event. Nobody can find it, sign up, or pay." and "Show on homepage" is accompanied by "A draft can't be on the homepage - it isn't public yet."; and the pricing block offers "Drop-in / Guest Fee (USD)" with help "Shown as the Guest tier on /pay alongside the Entry Fee." There is no PREVIEW block (no banner chosen yet).
- Control sizes at 1440: status <select> 782x48; "Show on homepage" toggle button 782x46; the two event-type choices are large option buttons 385x97 each; title <input> 782x52.4 with placeholder "Spring Classic 2026"; format <select> 782x48; description <textarea> 782x105.2. Footer actions "Save event" and "Cancel".

# A5 /admin/contacts — "People"
- h1 "Site"-nav label is "People"; page h1 "People", intro "Everyone who has ever signed up, paid, or been added by you. One row per person - their signups and payments all connect here."
- Toolbar: "Export CSV" and "Add person" (132x66 at 1440, 141x46 at 390); search input placeholder "Search name, email, or phone…" (866x38 at 1440, 308x38 at 390); a tag <select> (192x38 at 1440, 308x37 at 390) with options All tags / admin-added / backfilled / from-payment / from-registration / merged / paying / registered.
- 97 rows. It is a list of <li> rows, not a table. Each row shows a name (some are account handles rather than names), an email, sometimes a phone, one or more tag chips, an "Expand" button that measures 16x16, and a "Fix duplicate…" button that measures 98.4x16 at 12px. 97 of each.
- Expanding a row (read only) reveals a "Marketing opt-in (include in mass email / SMS exports)" control plus "Save changes" and "Delete".
- Typing in the search box filters live; typing a two-letter string narrowed 97 rows to 1.
- Page height: 1440x8245 at desktop; 390x15072 at mobile. At 390 each row is 136-137 tall and the first row starts at y518.

# A6 /admin/site — "Site settings"
- h1 "Site settings" (40px block), intro "Edit shared text and links that appear on the public site. Changes go live within ~1 minute.", and a "Reload" button 93.3x34 sitting to the right of the intro.
- Six independently-saved field groups, each with its own "Save" button (95.3x44) - six Save buttons on one screen:
  1. "Home page - status pills", help "Status indicators shown in the home hero (1-6 entries)." Each pill row is a text input plus a state <select> (options: open / closed / warning) plus a 30x30 "Remove" button. Then "Add status" (90.9x20) and the note "1-6 entries. At least one is required."
  2. "Footer - address", help "Mailing/visit address shown in the site footer."
  3. "Footer - Google Maps directions URL", help "Google Maps directions URL (must start with http:// or https://)."
  4. "Footer - WhatsApp invite URL", help "WhatsApp community invite URL."
  5. "Contact - public email", help "Public contact email shown in the footer."
  6. "Contact - public phone (optional)", help "Optional public contact phone number (leave blank to hide)." Placeholder "Optional - leave blank to hide".
- MEASURED SIZE MISMATCH in the pill editor: the pill label text input (placeholder "Label", holding the pill text) renders 34px wide by 44.4 tall, while the state <select> beside it renders 568x40. The other settings inputs on the page are 670x52.
- doc 1440x2417, no overflow.

# A7 /admin/diagnostics
- Intro references "magic-link deliverability and Supabase URL configuration. For SMTP and template steps, see docs/AUTH-CONFIG.md in the repository." Timestamp line "Last checked <date/time>", a "Refresh" button 99x34.
- A "Checklist" of named environment/config checks with OK / Fail / "Verify in dashboard" states. Items are named by environment variable and service: the Supabase URL variable, "Supabase project responds (auth health)" - state Fail, "Could not reach Supabase auth health endpoint.", the anon key shape check ("Looks like a JWT (three segments)."), the service-role key + admin API probe, the site URL variable, "Supabase Auth Site URL", "Supabase Redirect URL allow list", and "Third-party webhooks must use the www host" with a paragraph about Stripe and DocuSeal webhooks and the apex redirect.
- Below that: "Expected redirect URLs" listing a localhost callback and a production callback, a "Site URL" comparison table with "From API (if available) - dash", a note that a Supabase SDK method is unavailable, and an "Environment" block naming the Supabase host, "Auth health reachable: no", and the site URL variable. One link: "Open Supabase URL configuration" (250.7x20).
- The vocabulary here is environment variables, JWTs, SDK versions, dashboards, repositories and file paths - unlike every other admin screen, which is written in plain English.
- doc 1440x2444, no overflow.

---

# PART 2 — sign out and the admin login card
- The sign-out control in the admin nav was clicked. Signing out of the ADMIN left the PLAYER account still signed in (the public header still showed the account chip, "SIGNED IN AS OMAR", "Waiver good through <date>", Profile / My registrations / Sign out). A second sign-out, from the public account menu, was needed to reach a fully signed-out state; that one showed the transient label "Signing out…" and returned to "/". The signed-out public header ends in "Sign in" and "Register".

# ADMIN LOGIN CARD (/admin when signed out)
- Copy is exactly: heading "Admin Login", labels "Username" and "Password", button "Log In". No placeholder text on either field, no "forgot password" link, no link back to the public site inside the card, no error region visible in the resting state.
- The card is a "dashboard-card": 315x395, 32px padding, 12px radius, background rgba(15,29,51,0.9), 1px border rgba(30,47,77,0.6), computed box-shadow rgba(0,0,0,0) 0 0 0 — no visible shadow.
- The card measures 315x395 IDENTICALLY at 390, 768 and 1440; it does not grow with the viewport. It is horizontally centred: x=38 at 390, x=227 at 768, x=563 at 1440.
- Form controls are 249px wide at every width: username input 249x52, password input 249x52, "Log In" button 249x48. Labels 249x20 at 14px. Input padding 12px 16px, background #172a44, 1px border #1e2f4d, 8px radius, 16px text, white.
- The fields carry autocomplete="username" and autocomplete="current-password" and are named username / password.
- Heading "Admin Login" is 20px/28px Bebas Neue w600, letter-spacing 1.2px, #ffffff on #0f1d33 = 16.9:1. Labels 14/20 w500 #a1a1aa on #0f1d33 = 6.6:1. Button 16/26.4 w700 #ffffff on #0e7490 = 5.4:1.
- The surrounding section is the surface colour #0f1d33 with 64px vertical padding at 390 and 96px at 768 and above; section height 675 at 390, 720 at 768 and 1440. Page height 390x1724 / 798x1422 / 1440x1394.
- The public site header remains above the card at every width, and the 30px horizontal body overflow at exactly 768 is present on this page too (doc width 798).
- The admin nav bar is not rendered when signed out.

---

# PART 3 — PUBLIC SITE, SIGNED OUT

## Shell facts that repeat on every public page
- Signed-out header ends in "Sign in" (a text link) and "Register" (a white button with near-black text, 87.5x36) — but only from 768 up. At 390 the header contains exactly two visible controls: the logo link 40x40 and the hamburger 40x40. "Sign in" and the register CTA live inside the collapsed menu, and inside that menu the register control is labelled "Sign up to play" (342x50), not "Register".
- Opening the mobile menu grows the header from 64 to 436 tall; menu links are 342x24 each.
- HORIZONTAL OVERFLOW AT EXACTLY 768: the signed-out header's desktop nav group is 723px wide starting at x=158, so its right edge lands at 881 — the document scrolls sideways by 113px at 768 on every public page measured (/, /events, event detail, /register). The white "Register" button is the element furthest past the edge (right edge 881). At 767 the hamburger is back and doc width equals viewport width.
- The header logo image is a 48x46 source. It renders 36x36 at 390 and 44x44 at 1440, both with object-fit: fill. At 768 on the event detail page it rendered 20.3x44 from the same 48x46 source — a non-uniform scale.
- Footer is identical everywhere: brand blurb 14/22.75 #a1a1aa 7.4:1, address, "Get Directions" (12px), QUICK LINKS column, CONTACT column with a mailto link (210.1x17) and "Join Community Chat", then a legal row (About / Contact Us / Privacy / Terms / Refunds / Cookies) at 14/20 in #71717a on #07111f = 3.9:1, and a copyright line in the same #71717a 3.9:1.
- A FIXED external link "Need a website?" (174x38, white text on #0f1d33, position:fixed, bottom-left at x20, z-index 40) is present at 768 and 1440 pointing at an outside commercial domain. At 390 it is not rendered (0x0).

## P1 — / (homepage)
MOBILE 390x844: doc 390x6696, no overflow.
- Above the fold: header (h64) > hero section starts y65 > status pills row "Registration Open / Fields: Open" y278.4 > h1 y340.4 h120 ("Houston Premier Soccer", 48px/60px Bebas Neue, the word "Premier" in #22d3ee = 10.5:1) > hero paragraph y476.4 h87.8 (18px/29.25 #e4e4e7 14.9:1) > CTA stack y588.1 h114.8: "Sign up to play" 342x50.4 (#ffffff on #0e7490 = 5.4:1) and "View events" 342x52.4 (#ffffff on #172a44 = 14.5:1) > and, pinned to the bottom of the viewport, the FIXED quick-actions bar at y771 h73: two buttons "Events" 179x48 and "Directions" 179x48, background rgba(15,29,51,0.95), backdrop blur, z-index 50.
- The hero SECTION is 1173.1 tall in an 844 viewport. Its background image is served at natural 390x292 and displayed at 390x1173.1 with object-fit: cover — roughly a 4x upscale.
- Section rhythm below the hero: five sections, each with 64px top and bottom padding — "Featured Events" (y1238.1, h699.3), "What Happens Here" (y1937.3, h1474), "Recent Events" (y3411.4, h856.3), "Find the Fields" (y4267.7, h1127.2), a closing CTA (y5394.9, h406). The "What Happens Here" background image is natural 390x260 displayed 390x1474 with cover.
- Featured tournament card is a single link 340x371.1 containing its own "Sign up now" (132.8x38) and, below the card, "Sign up to play" 300x44 and "View tournament details" 300x16 at 12px.
- Recent event cards 342x166.8 / 342x140.4. "View all events" 140.5x26.4. "View Facility Details" 179.3x26.4. "Google Maps" 111.2x26 at 12px. "Get Directions" 292x48. "Contact Us" 342x52.4.
- Type on the page: section h2 24px/32 Bebas Neue w700 (ls -0.6px or 1.44px depending on section); h3 18px/28 Inter 600; section subtitles 18px/28 #a1a1aa (7.4:1 on base, 6.6:1 on surface); card body 16px/26.4 #a1a1aa 6.6:1; dates 14px #d4d4d8 11.4:1; "Mon-Fri:" label in JetBrains Mono 14px #22d3ee on #172a44 = 8:1.
- 38 interactive elements, 24 under 44px in one dimension.
TABLET 768x900: doc 881x5184 — 113px horizontal overflow. The fixed bottom bar is GONE at 768 and is replaced by a STICKY quick-actions bar directly under the header (768x67 at y81, "Events" 104.8x42 and "Get Directions" 143.5x36). Measured at 767 the fixed bottom bar is still present and there is no overflow; at 768 the bar has switched and the overflow appears. h1 becomes 72px/72px, hero paragraph 20px/28, section h2 30px/36. Hero section 1272.3 tall. Featured card becomes 718x516.5; recent-event cards 224x272.3 in a 3-up row.
DESKTOP 1440x900: doc 1440x4526, no overflow. h1 96px/96px, occupying y503.4 h192 — the h1 alone is 192px tall and the hero CTA row sits at y791.4, so the hero fills the whole first screen. Hero image natural 1024x768 displayed 1440x807.8 cover. Sections carry 96px top and bottom padding. Featured card 378x367.8 beside a 538x235.4 image; recent-event cards 352x166.8; "What Happens Here" photos natural 450x263/450x300 at 350x196.9.

## P2 — /events
- h1 "Tournaments & Events" 36px/40 Bebas Neue at 390, 60px block at 1440. Intro 20px/28 #d4d4d8 12.8:1.
- Two sections: "Tournaments" with sub-line "Seasons with teams, a schedule and a league table. Upcoming first, then completed events you can still browse." and an eyebrow "UPCOMING — REGISTRATION & PAYMENTS OPEN"; and a closing "Don't see your event?" section with "Join WhatsApp" (342x52.4 at 390, 280x52.4 at 1440).
- Each event entry prints its FULL description inline. The live tournament's description runs to a single 16px/26.4 paragraph (#a1a1aa on #0f1d33 = 6.6:1) containing the format, roster limits, team requirements and payment instructions. Page height at 390 is 390x4806; at 1440 it is 1440x4704.
- Per-entry controls: title link at 24px Bebas (245.4x31 up to 369.6x31), "Sign up to play" 292x44 (390) / 200x44 (1440) — present on 2 of the 5 entries — and "View details" 292x20 / 200x20 at 14px on all five.
- Images: three of five entries have one; one renders with object-fit: contain (natural 390x585 portrait shown in a 340x420 box, letterboxed) while the others use cover; one image had not loaded at measurement time.
- 29 interactive at 390 (23 small), 35 at 1440 (30 small).

## P3 — /events/<slug>
Covered in full: the running tournament (community-cup-fall-2026) at all three widths, plus one completed tournament (spring-classic-2026) at 390. The other three (world-cup-summer-tournament, open-play-july-27-28-2026, memorial-day-open-play-2026) were listed but not opened; all three are completed events and the completed template is represented by spring-classic-2026.
RUNNING TOURNAMENT, 390: doc 390x3990.
- Order: header > "All events" back link y107 (84.1x20) > three status pills y143 h64 — "UPCOMING" (12px JetBrains Mono uppercase #22d3ee on #07111f 10.5:1), "REGISTRATION OPEN" (#ffffff on #0e7490 5.4:1), "PAYMENTS OPEN" > h1 y223 h36 (30px/36 Bebas) > "Games are every Friday, starting August 21st." y275 > "6:55 – 11:00" and "Mixed 7v7" y303 > address y331 > banner image y391 h197.6 > h2 "ABOUT THIS TOURNAMENT" y628.6 at 16px > a 546px-tall description paragraph y656.6.
- Then "WHAT YOU'RE WALKING INTO" (six labelled points: Real grass field / 25-minute halves / Refs on every match / Cleats required / Friendly play — no slide tackling / MVP awards at the final whistle), "UPDATES" with empty state "No updates yet. Check back as the tournament gets closer." (14px #71717a on #0f1d33 = 3.5:1), "SCHEDULE & STANDINGS" with a Schedule toggle button (117.4x42) and Round 1 fixtures, a "Take part" block, then "Entry fee: $80.00 · Max 8 teams", coordinates "29.6547° N · 95.4189° W", a "Google Maps" link and "Get Directions".
- THERE IS EXACTLY ONE "Sign up to play" CONTROL ON THE PAGE. It measures 300x44 and sits at y=2565 of a 3990-tall document. At 768 it is 678x44 at y=2178 of 3229. At 1440 it is 294x44. Nothing about signing up is sticky, and there is no second CTA higher up.
- Also present: "Share tournament" 300x46, "WhatsApp community" 124.5x16 at 12px, "Questions? Join WhatsApp" 152.8x16 at 12px.
- 24 interactive at 390 (20 small); 30 at 1440 (25 small).
- Banner image: natural 390x260 at 342x149.6 (390); natural 768x512 at 720x270 (768); natural 1152x768 at 1104x414 (1440), all cover.
COMPLETED TOURNAMENT, 390: doc 390x2476. Same template minus the sign-up path: 18 interactive elements, and the only body control is "Share tournament" 300x46 — no "Sign up to play", no fixtures. The status pill row shows a single "COMPLETED". The "UPDATES" block still reads "No updates yet. Check back as the tournament gets closer." on a finished event. The ABOUT paragraph on this event reads, publicly: "Friday-night league, Spring 2026. Archive event restored 2026-08-17 to re-home registrations and payments stranded when the original event row was deleted."

## P4 — /register
390: doc 390x3071.
- h1 "Sign up — Community Cup - Fall 2026" y113 h72; sub-line y197 h84 "Mixed 7v7 · Games are every Friday, starting August 21st. · 14062 Ambrose St, Houston TX"; "Event details" link y297 (84.4x20).
- Returning-player block y452.4: "Played with us before?" + "Sign in and we'll skip straight to your team and payment — no form, and no waiver if yours is still valid." + "Continue with Google" (300x48) at y540.4. Then "New here? Just fill in the form below — no account needed." y604.4.
- Field order: "Your team" <select> 342x48 (options: "Not sure yet — assign me later" then the six teams) with help "Pick your team if you know it. You can change this later — just ask us at the field." > "Registration Type *" <select> 342x48 ("Select one…", "Adult (18+)", "Youth (parent/guardian registering)") with help "Adults sign the adult waiver. Youth registrations use the youth waiver (signed by a parent or guardian)." > "Name *" group: "First name *" and "Last name *" inputs 342x52.4 with 12px labels > "Contact Info *" group: "Email Address" 342x52.4 and "Phone Number" 342x52.4 > "Date of Birth *" 342x54.4 with help "Must be 18+ for adult registration. Youth players must have a parent or guardian register." > "Emergency Contact *" with help "Someone we can reach in case of an emergency during the event.", then "Emergency contact name" 342x52.4 and "Contact Phone Number" > a consent checkbox measuring 13x20 beside the text "I agree to the waiver and terms of participation. I understand that soccer is a physical activity with inherent risks." > "Submit Registration" 342x48 > help "After submitting, you'll be directed to sign the waiver. Registration is not complete until the waiver is signed." > "Questions? Join our WhatsApp community" 174.8x16 at 12px.
- Field labels are 12px for the text inputs but 14px for "Your team", "Registration Type *" and "Date of Birth *".
- 39 interactive, 27 under 44px.
768: doc 881x2330 (the 113px overflow). 1440: doc 1440x2310; the form well is 672 wide centred at x=384; paired fields sit in a 2-column grid of 328px; selects and the submit button run the full 672; the consent checkbox measures 17x20.

## P5 — /about
- h1 "Built for 7v7 Soccer"; intro "A facility and organization focused on fast-paced 7v7 play: the game, the community, and doing things right."; a "The Story" section of three long paragraphs.
- 390: doc 390x3544, 16 interactive elements — the logo, the hamburger, and footer links. There is NO call to action anywhere in the body of this page at 390. At 1440 the count is 22 and the only additions are the header nav, "Sign in" and "Register".

## P6 — /facility
- h1 "The Facility"; sections "The Fields" (4 bullet points), "Amenities" (Field Lighting / Spectator Areas / Parking / Restrooms with one-line captions), "Field Rules" (numbered 01, 02, …).
- Copy on this page says "Dedicated 7v7 turf fields", "Professional-grade turf". The event detail pages say "Real grass field" and "Natural turf under the lights."
- VIDEO: one <video>, source natural 720x1280 (portrait), displayed 340x190 at 390 and 526x295 at 1440, object-fit: cover — so the portrait source is cropped into a landscape box. Attributes: autoplay, loop, muted, playsinline, poster image set, and controls = TRUE (native playback controls are exposed). It was paused on first measurement and playing (currentTime advancing, readyState 4) after being scrolled into view.
- 390: doc 390x4280. 1440: doc 1440x3206.

## P7 — /contact
- h1 "Get in Touch", intro "Questions about events, facility rentals, or registration? Reach out and we'll get back to you."
- "Send a Message" form: Name (label 342x20 at 14px, input 342x52.4), Email (input 342x52.4), Subject <select> 342x48 with options General Inquiry / Tournament Registration / League Information / Field Rental / Other, Message <textarea> 342x158, "Send Message" 342x48.
- Side content: "Contact Info" with an email address, "WhatsApp Community — Join our community chat", the address with "Get Directions", and "Response Time": "We typically respond within 24-48 hours. For urgent matters, please call during business hours (9 AM - 6 PM)." No phone number is published anywhere on the page.
- 390: doc 390x2459, 28 interactive (22 small). 1440: doc 1440x1668, form starts at y509.

## P8 — /login
- Hero band (y65 h248) with "Sign in" and "One tap with Google. No password to remember."; then h2 "Player sign-in" y377, paragraph "Use the same email you registered with and we'll find your profile and waiver automatically." y421, "Continue with Google" button 342x48 at 390 / 448x48 at 1440, then "You don't need an account to play. Signing in just saves you filling in the form — sign up for an event without one any time." with "sign up for an event" as the only inline link (131.3x17), then a further line beginning "Signed in with a link or…".
- Google is the only sign-in method offered. 18 interactive at 390, 16 of them under 44px.
- doc 390x1724 / 1440x1394.

## P9 — /privacy, /terms, /refunds, /cookies
- All four share one template: h1 at 36px, a one-line summary, and a "Last updated August 12, 2026" line. They differ only in length and section count: Privacy 5009 tall / 10 h2 sections, Terms 4879 / 12, Refunds 3351 / 7, Cookies 2737 / 5.
- Privacy's summary line: "What we collect when you register or pay, who else sees it, and how to get it removed." Body opens "Houston Premier Soccer runs 7v7 soccer events at <address>. This policy covers this website and the registration, waiver and payment steps that run through it."
- Body links are 16px inline links (a mailto repeated three times, plus a "cookie notice" cross-link). 25 interactive elements, 24 under 44px.

## P10 — /me signed out
- Redirects to /login?next=%2Fme. The page rendered is the ordinary /login page; there is no banner, message or explanation saying why the visitor was sent there or what /me is.

## P11 — /pay signed out
- Does NOT redirect. It stays on /pay and renders its own page: h1 "Make a payment" (y113 h36), "Secure payment via Stripe. Verify your email and waiver, then complete payment." (y157 h52.8), "Questions? Join our WhatsApp community" (y221.8), then h2 "Choose an event to pay" (y353.8) and "Open the payment page from your event's page so we can match your registration, or pick an event below." (y393.8 h68.3), followed by a single "View events" button 136.1x50.4.
- Despite "or pick an event below", no event list is rendered on the page — the only control is "View events". doc 390x1724. 18 interactive, 16 small.

## Verified specifics
- HOMEPAGE AT 390, SCROLLED TO THE BOTTOM: there is no bottom spacer. document height 6696, maximum scroll 5852, body padding-bottom 0, main padding-bottom 0. The fixed quick-actions bar occupies y771-844 of the viewport; at full scroll the footer's legal link row (About / Contact Us / Privacy / Terms / Refunds / Cookies) sits at y776-796 — underneath the bar. The copyright line above it (y692-732) is clear.
- /pay was re-measured after an extra 2.5s wait: still 1724 tall, still no event list, still one "View events" control. The sentence "or pick an event below" is not accompanied by anything below it.
