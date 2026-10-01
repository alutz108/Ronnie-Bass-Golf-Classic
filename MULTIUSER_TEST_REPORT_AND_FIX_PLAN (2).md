# Ronnie Bass Classic: 14-user test report and fix plan

Date: Sept 30, 2026. Tested build: `rbc-shell-v18`. **Update: items 1, 4, 6, 7, 9 and 10 are fixed in build 19; items 2, 3 and 8 are fixed in build 20 (`rbc-shell-v20`)**; item 5 (lineup, roster and final-flag edits overwriting each other) is still open.

## How it was tested

The real `index.html` ran as 14 separate "phones" sharing one simulated Firestore. Each phone had its own storage, clock, and network (latency, offline periods). The access-code rule was enforced like the real security rules. Results were checked against an independent calculation of handicaps, strokes, and Nassau.

**Not tested:** real Firebase (its latency compensation, offline cache, quotas), real iPhones (backgrounding, the Safari bottom-edge issue), real mobile networks, 14 phones uploading photos at once.

## What worked

| Test | Result |
|---|---|
| 14 phones open the app at the same moment on an empty database | All 14 show Live; identical settings; 0 errors. A few identical default writes at start (harmless). |
| All 14 players score their own ball on their own phone for a full round | 0 of 3,528 cells wrong on any phone; Nassau results match the independent calculation on all 14 phones; all 3 matches submitted; every phone shows the same team totals |
| Database load for that round | 159 writes, about 2,400 reads (free plan: about 20,000 and 50,000 per day) |
| 6 of the 14 phones are watchers using the watch link | 0 writes, no code prompt, saw all 72 scores, could not change anything |
| Phones randomly losing signal for 1.5 to 4.5 seconds while 8 people score | All 14 phones ended identical |
| Reset all scores while one phone is offline, then it reconnects | Stayed reset |
| Phones with a wrong access code | No retry storm (0 further rejected writes while idle) |
| Crash fuzz: 14 users, 4 runs, all tabs, follow mode, undo, admin actions | About 12,000 redraws, 0 app errors |
| Page speed with a full weekend of data | Slowest page about 20 ms (about 120 ms on a phone); storage use 228 KB of about 5 MB |

No crashes were found.

## Problems found

### High: fix before the weekend

**FIXED in build 19. 1. Phones on different app versions can show wrong match results.**
Four old-version phones and 10 new-version phones scoring one match: the two versions compute different handicap strokes (for example Lutz 20 versus 18). On 6 close matches, the two versions disagreed on the Nassau result in 2, and the phones showed the old version's answer.
*Cause:* nothing forces phones to run the same version after an update. *Fix:* put an app version number in the shared settings; a phone running an older version shows "Update available, tap to reload" and cannot write until it reloads.

**FIXED in build 20. 2. Some settings exist only on the phone where they were set.**
These are: the Sunday course, payout amounts, power-ranking settings, and the scoring log. Tested: Sunday leaderboard totals were 90 and 104 on the phone that chose the course and 108 and 108 on every other phone. The pairing optimizer suggested different matchups on two phones. (Already on the handoff's pending list.)
*Fix:* move the Sunday course, payouts, and power-ranking settings into the shared settings record, so every phone uses the same values; block Sunday scoring until a course is picked.

**FIXED in build 20. 3. Two phones editing the same score can disagree for good.**
Two people editing the same player's same hole at nearly the same time, with phone clocks a second or two apart, left 13 phones showing one value, 1 phone showing another, and the database holding the second. A phone opening the app later shows the database value, so the display would flip after a restart. A phone that loses signal, edits a score, and reconnects after someone else corrected that score gave the same split in 1 of 4 runs.
*Cause:* receiving phones throw away updates with an older version number, but the database keeps whichever write arrives last. *Fix:* make the database the judge. A phone accepts the database value unless it has its own unsent edit for that exact score. Re-test with the same two scenarios.

**FIXED in build 19. 4. A phone still holding old test scores can push them into the live event.**
A phone that joins with leftover local scores uploaded 4 score fields into a match nobody had scored yet. (It looks likely your own phone has test data.)
*Fix:* when a phone first connects, treat the database as the truth, and only push values the user typed in this session. Add a "Start fresh on this phone" button in Admin. Clear all phones before the event.

### Medium

**5. Lineup, roster, and "final" edits can overwrite each other.**
Two admins adding different players to the same match at the same moment: one add was lost (D2). The same player added to two different matches by two admins at once ended up in both matches (D3). Two admins editing different parts of the roster at once: the first admin's rename was lost (D5). And when a score correction changed the match result on a phone with a slow signal, the match's "submitted final" flag disappeared on all 14 phones (D4).
*Cause:* lineup, results, and final flag are saved as one block, and roster and settings as another. *Fix:* split them into separate fields (lineup per side, results, final flag; each roster entry). Cheaper stopgap: only the commissioner phone edits lineups, rosters, and settings.

**FIXED in build 19. 6. The last score, or a correction, can be lost if the app closes within about a second.**
A new score survived, but a correction from 5 to 6 reverted to 5 after the app reopened.
*Fix:* push pending scores immediately when the app is hidden or closed, shorten the delay for score fields, and remember which fields were edited locally and not yet saved.

**FIXED in build 19. 7. Typing in a box can be interrupted.**
When another phone's score arrives while an admin is typing in Rules text or a payout box, the page redraws, the keyboard closes, and the cursor is lost.
*Fix:* delay redraws while a box has focus and redraw when it loses focus.

**FIXED in build 20. 8. "Apply this match" one at a time breaks lineups.**
Applied in turn it placed 11 of 14 players with 2 duplicated; three admins applying one match each at the same moment placed all 14 correctly.
*Fix:* an "Apply all matches" button; never apply over a match that already has scores.

### Low

**FIXED in build 19. 9. Wrong-code phones keep unsaved scores on their own screen.** The badge says View only and no further writes are attempted, but those scores show only on that phone. *Fix:* when a write is rejected, revert that score to the database value and show "Not saved".
**FIXED in build 19. 10. Cold-start writes.** About 8 identical default records written when 14 phones open at once. *Fix:* skip writing the unchanged default settings.

## Plan

**Phase 0: before the trip, no code (30 minutes)**
- Only the commissioner phone edits lineups, rosters, settings, and the pairing tool.
- One scorer per match, or each player scoring only their own ball, never two phones for the same player.
- Before play each day: every phone reloads the app, then Admin shows "Screen info" so you can confirm the same version.
- Every phone picks the Sunday course, or the commissioner does Sunday scoring until fix 2 is in.
- On any phone that was used for testing, open the app once and use "Reset all scores" on the commissioner phone before the event.
- Download a backup after each round.

**Phase 1: small fixes (one session):** items 1, 4, 6, 7, 9, 10.
**Phase 2: medium (one to two sessions):** items 2, 3, 8.
**Phase 3: larger:** item 5 (split lineup, results, final flag, and roster into separate fields).

Each fix gets a test added to the harness (`multiuser-tests.zip`), so a regression shows up straight away: D9 and D9b for item 1, D7 for 2, D1 and D12 for 3, D10 for 4, D2 to D5 for 5, D11b for 6, the focus test for 7, D13b for 8.

Items 3 and 12 depend on timing, so they should be re-run several times after any change to the sync code.


## Status after the small fixes (build 19)

| Item | Result in the 14-phone harness |
|---|---|
| 1. App build check | Phones on an older build were held back (10 of 10), could not save, and showed an Update notice; phones on the newer build were fine; updating clears it. |
| 4. Old local data | 0 old test scores reached the live event; the old phone's copy was cleared; a real score typed afterwards synced. |
| 6. Unsent edits | A correction (5 to 6) and a brand-new score both survived the app being killed; hiding the app sends pending scores at once. |
| 7. Typing | A redraw is held while a box has focus (cursor and keyboard stay); a settings update from another phone is kept and applied when the box loses focus. |
| 9. Wrong code | The phone's unsaved scores are taken back off its screen (0 shown), a "Not saved" card appears, and entering the right code clears it and the next score saves. |
| 10. Cold start | Writes when 14 phones open on an empty database dropped from about 10 to 3 (a tiny version stamp only); the first real edit still goes through. |

Regressions re-run and clean: independent scoring check (4,000 random matches, 90 percent and 100 percent allowance), plus-handicap rule, best ball payouts, 6 full weekends through the keypad, backup and restore, a 14-phone round, 25-phone sync, 26-phone chaos (clock skew, outage, dead listeners) and 14-user crash fuzz.

Note on write counts: scores now sync after 250 ms instead of 900 ms, so in the sped-up 14-phone test (a hole every fraction of a second) writes rose from 159 to 330 because fewer taps merged into one write. At real pace there is one write per tap either way.


## Status after items 2, 3 and 8 (build 20)

| Item | Result in the 14-phone harness |
|---|---|
| 2. Shared settings | Sunday course picked on one phone appeared on 14 of 14 phones (and on a watch-link phone); payout amounts and a power-ranking setting synced; the Sunday leaderboard and the Saturday pairing suggestion were identical on all 14 phones. Phones that opened holding different old values did not overwrite each other; one tap on "Use this phone's settings for everyone" made all phones adopt them. A Sunday score tapped with no course is refused and the live screen asks for the course. |
| 3. Score conflicts | The previous build diverged in 3 of 3 runs of the clock-order test and 4 of 6 runs of the offline-reconnect test; build 20 was consistent in 3 of 3 and 10 of 10. Two admins adding different players at the same moment now leave every phone agreeing with the database (one of the two adds is still lost: item 5). |
| 8. Optimizer | Apply all placed 14 of 14 players with no duplicates; tapping Apply on match 1, 2, 3 in turn placed 14 of 14 (was 11 of 14 with 2 duplicates); recalculating after applying gives the same suggestion; a match with scores is refused; the day picker applies Saturday without touching Friday; a watch-link phone cannot apply. |

Regressions re-run and clean: independent scoring check (4,000 random matches at 90 and 100 percent allowance), plus-handicap rule, best ball payouts, 6 weekends through the keypad (the Sunday step now chooses the course first, as the app requires), backup and restore, the build 19 fixes, a 14-phone round, 25-phone sync, 26-phone chaos and 14-user crash fuzz.

Remaining: item 5 (lineup, results and the final flag are still saved together, so two admins editing at the same moment can overwrite each other, and the same player can end up in two matches). Until then keep lineup, roster and settings edits to one phone.


## Practice tournament (build 21)

Added at the owner's request so people can learn and test the app without touching the real event. Tested in the 14-phone harness (`scen_practice.js`) and in a phone-sized browser (`practice.js`):

| Check | Result |
|---|---|
| Practice phone connects to the database | No: 0 listeners, 0 reads, 0 writes |
| Real saved copy on that phone after practicing | Byte-for-byte unchanged; the real event phones and database unchanged |
| Starts blank, with the real roster and settings copied | Yes (an edited name and payout amount carried over; no lineups or scores) |
| "Play the whole weekend" | 13 of 13 matches submitted; totals add to 40; every match matches the independent scoring calculation; payouts and power rankings update |
| Exit practice | Back on the real event, connected and live, real scores and roster intact; practice copy kept for later |
| 14 people practicing at once | 0 database writes; each phone has its own different results |

Limit: practice is per phone. It is not a shared practice event that several phones play together (that would need a separate area in the database and a change to the security rules).
