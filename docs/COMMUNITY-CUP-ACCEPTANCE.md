# Community Cup — the owner's Friday checklist

Run this on **production** (www.houstonpremiersoccer.com) after the deploy, ideally on
**Friday Sep 11** while Round 3 is being played. Only the owner can do it: production
rejects a locally signed admin cookie, so nobody else has ever clicked these screens live.

Everything here takes about ten minutes on a phone. Tick each row when it passes; write
what you saw when it does not.

**Pre-flight (done by the developer before the deploy):**

```bash
npm ci
npx tsc --noEmit
npx tsx scripts/test-standings.ts
npx tsx scripts/test-schedule.ts
npm run build
```

**Database (already applied on 2026-09-08):** migration
`20260908120000_round_counts_and_scorer_identity.sql` and the import
`scripts/import-community-cup-fall-2026.sql`. **Still to apply, after this deploy is live:**
`20260908120100_matches_integrity_constraints.sql`.

---

## 1. The public page on a phone (before entering anything)

Open `https://www.houstonpremiersoccer.com/events/community-cup-fall-2026` on your phone.

| Step | Pass? |
|---|---|
| Directly under the title there is an "At a glance" card: Hiram Clarke FC lead on 6 pts, last matchday's three scores, and "Next: Round 3 · Fri Sep 11 · 7:00 PM". | |
| Three tabs fit the screen with nothing cut off: **Table · Matches · Scorers**. | |
| **Table**: six rows, points visible on every row, no sideways scrolling. Hiram Clarke and Post Oak on 6, 3rd Ward on 3, Beltway / Bellaire / Townwood on 0. A line under 4th place says the top 4 go to the semi-finals. | |
| The table's GD reads +13 and +12 for the top two. (Your spreadsheet says 9 and 8; the spreadsheet is wrong there, 18−5 = 13 and 18−6 = 12.) | |
| **Matches**: Round 2 and Round 3 are open, the rest are collapsed. Round 1 shows match #1 Beltway v Bellaire as "Postponed" with the September note. Semi-Final, Exhibition and Final are listed with placeholder pairings. | |
| **Scorers**: Kelvin Cardona 8, Jesse Pecero 6, then Rene Cruz and William Franco on 5 sharing 3rd place. "Own goals: 2" at the bottom. | |
| Tap **Table**, then tap the browser's Share button (or copy the address). The link ends in `?tab=table`. | |
| The flyer, the description and the updates are still on the page, below the scores. | |

## 2. Three names to confirm from the spreadsheet

The site credits each goal to the team whose match line it was on. Your sheet's scoring
list disagrees in three places. Confirm or fix them in admin (Schedule & scores, tap the
name on the played match to rename; use Edit result to move a goal to the other team).

| Player | Site says | Your list says | Correct? |
|---|---|---|---|
| Brandon Bricker, 3 goals in match 3 | Hiram Clarke FC | Bellaire FC (Bellaire did not play in match 3) | |
| Jose Chavarria, 2 goals in match 4 | Bellaire FC | Beltway FC (Beltway did not play in match 4) | |
| Tony, 2 goals in match 3 | Hiram Clarke FC | Post Oak FC (Post Oak did not play in match 3) | |
| Tony, Antonio, Bryan (Hiram Clarke), Alexis "Chino" | first name only | unknown surnames — rename when you know them | |

## 3. Enter Round 3 on Friday night (admin, on a phone)

Open `/admin`, Events, Community Cup - Fall 2026, **Schedule & scores**.

| Step | Pass? |
|---|---|
| The tab opens on a list of round cards. Round 3 is marked as the next matchday. No money tiles above it. A "View public page" link is in the header. | |
| On the 7:00 PM match (Hiram Clarke v Post Oak) tap **Enter result**. A sheet opens with two big score fields and, under each team, its players. | |
| Enter the score. Tap player names once per goal; the line at the top reads "Scorers: N of N goals" and turns green when they agree. | |
| For one goal use the **Own goal** button under the team that benefited (the other team put it in their own net). | |
| For a guest who is not on the list, use **Someone else** and type the name. | |
| Tap **Save**. The toast says "Saved. Table and scorers updated." and the row now shows the score and the scorers. | |
| Repeat for the 8:00 PM and 9:00 PM matches. Three matches, three Saves, nothing else to remember. | |
| Open the public page on your phone: the At-a-glance card shows Round 3 as the last matchday, the table has moved, the Scorers tab includes tonight's goals, and "Next" now says Round 4 · Fri Sep 18. | |
| Tap **Edit result** on one match, change a scorer, Save. The public page reflects it. | |

## 4. The two things that used to go wrong

| Step | Pass? |
|---|---|
| There is no Status dropdown anywhere. A match can only become played by Save in Enter result, so a score can never sit invisible on the public page. | |
| On the Teams tab, try to delete a team that is in the schedule. It refuses with a sentence naming how many matches it is in. | |

## 5. If something fails

Send the developer: which row failed, what the screen said (screenshot), the time, and the
phone you used. Nothing in this checklist deletes data; every result can be edited or
cleared from the same sheet.
