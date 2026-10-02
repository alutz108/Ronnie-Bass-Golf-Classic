# Ronnie Bass Classic — Developer Handoff (for the next Claude)

> **Read this whole document before touching code.** This is a mature, single-file web app that is actively used on phones during a golf trip. Your job is to **continue** it, not rebuild, restyle, reformat, or "modernize" it. Make small, surgical edits to the existing `index.html` and hand back the complete updated file.

Handoff written: Sept 30, 2026. **Corrected the same day against the uploaded Firebase version of `index.html`** (sync backend, access code, service worker, match finalization). Source of truth = the `index.html`, `manifest.json`, `sw.js` (plus `README.md`, `firestore.rules`) in the Claude Project. Where the owner's notes and the code disagree, **the code is described** and the difference is flagged.

---

## 0. Rules for the next Claude (non-negotiable)

1. **Do not rebuild the app.** No React, no frameworks, no build step, no splitting into multiple files, no reformatting/prettifying the minified style. It is intentionally one self-contained `index.html` with inline CSS + JS and base64-embedded images.
2. **Edit surgically.** Change only the functions/CSS needed. Keep all existing variable and function names (they are short on purpose and referenced across the file and in stored data).
3. **Always return the complete, updated `index.html`** as a downloadable file (the owner copies it into GitHub by hand — see §18). Never return partial snippets as the "final" deliverable unless asked.
4. **Never break stored data.** Phones already have `localStorage` data under key `rbc_v2`. Any change to the shape of `S` must be backward-compatible (add defaults/migrations at startup like the existing ones — see §5.5).
5. **Do not re-add removed features** (see §17): no pickup/X button, no Nassau boxes on Scoreboard, no Closest to Pin/Long Drive/Birdie Bro/My Chippy boxes, no buy-ins anywhere, no Upcoming/Finished sections on Scoreboard, Admin & Rules stay inside More.
6. **Ask before** changing colors, fonts, tab order, award names, scoring rules, or payout rules.
7. Players are identified by **array index** (`ti_pi`), not by name. Reordering/removing players reindexes everything — handle with care (see `rm()`).

---

## 1. What the application is

A mobile-first PWA scoring app for the **Ronnie Bass Classic**, an annual Ryder-Cup-style golf trip between **Team Lutz** and **Team Guad** (7 players each). The **current event year is 2027**. Visual layout was modeled on another app ("Stolen Tee III" standings app) but uses the Ronnie Bass logo and its color scheme.

It does:
- Hole-by-hole **live scoring** of every match with handicap strokes, auto-computed hole winners, match status ("Team Lutz 2 UP thru 11"), and automatic Nassau (front/back/overall) results.
- **Team scoreboard** with points, projected points, and the current day's "points in play".
- **Rosters** with handicaps, headshots, player profiles, power rankings, head-to-head rivalries.
- **Historical results** for 2024, 2025, 2026 (hard-coded) plus all-time team/individual records.
- **Leaderboards**, **stat/side-game awards**, **payouts** calculator.
- **Photo album** by year (only when live DB is available).
- Light/dark theme, installable to home screen.

---

## 2. Files

| File | Purpose |
|---|---|
| `index.html` | The entire app: HTML shell, `<style>`, and one `<script>`. Very large because logos, team logos (2024/25/26/27 variants), and default player headshots are embedded as base64 data URLs. |
| `manifest.json` | PWA manifest: name "Ronnie Bass Classic", short_name "Ronnie Bass", `start_url: ./index.html`, `scope: ./`, `display: standalone`, background/theme `#0B3350`, icons `icon-192.png` / `icon-512.png` (any + maskable). |
| `sw.js` | Service worker, **network-first** with cached fallback when offline. `const CACHE = 'rbc-shell-v36'`; precaches `./`, `./index.html`, `./manifest.json`, `./icon-192.png`, `./icon-512.png`. Ignores cross-origin requests (Firebase). **Registered** at the end of `index.html`. **Bump `CACHE` on every release.** |
| `firestore.rules` | Firestore security rules to paste into the Firebase console (reference copy; the app doesn't load it). |
| `README.md` | Firebase setup guide (project, Firestore, anonymous auth, rules, `config/access` code doc, pasting `FIREBASE_CONFIG`). |
| `icon-192.png`, `icon-512.png` | Home-screen icons. Referenced by manifest; were not in project knowledge, assumed to be in the GitHub repo (verify). |

External requests: Google Fonts (Barlow 500/700, Barlow Condensed 700/800) and the Firebase JS SDK 10.13.0 compat builds (`firebase-app`, `firebase-firestore`, `firebase-auth`) from `www.gstatic.com`, plus Firestore/Auth traffic. No build step.

---

## 3. Tech architecture (how index.html works)

- **Vanilla JS, global scope.** All functions are globals called from inline `onclick="..."` attributes in template strings.
- **One global state object `S`**, persisted to `localStorage['rbc_v2']` by `save()`.
- **Render model:** `render()` → `save()` → rebuilds `#main.innerHTML` from the current tab's page function. Every render also persists and schedules sync (`save()` calls `pa()`).
- **Pages are pure string builders** returning HTML (template literals). User strings must go through `esc()`.
- **Bottom sheet modal:** `sheet(html)` opens `#ov`/`#sh`; `shut()` closes. Used for player pickers, Nassau result pickers, rename, etc.
- `$ = s => document.querySelector(s)`.
- Startup order at end of script: `render(); initDb(); pSub(PY);`

### HTML shell
```
<header>
  <img logo>                         (Ronnie Bass logo, base64)
  <button id="hd" onclick="rename()">  <span id="lbl">(tab label)</span> <h1><span id="ev">(event name)</span> ▾</h1>
  <span id="sy" class="sy">          (sync status: "● Live" | "● Offline (saved on this phone)" | "Connecting…" | "View only" | "Local")
</header>
<main id="main"></main>
<nav> Teams(t) | Leaderboard(l) | Scoreboard(s) | Matches(m) | More(o) </nav>
<div id="ov"><div id="sh"></div></div>   (bottom sheet)
```

---

## 4. UI structure & navigation

### Navigation state variables
| Var | Meaning |
|---|---|
| `tab` | Current bottom tab: `'t'` Teams, `'l'` Leaderboard, `'s'` Scoreboard (**default**), `'m'` Matches, `'o'` More (`'h'` still exists in the router for History but is no longer a tab) |
| `LV` | Live scoring view state `{mi, h, k, tab, follow, look, more, hist}` (match index, hole 0–17, selected player key `"ti_pi"`, tab, follower flags, undo history), or `null`. Timers/flags: `LVT` (auto-advance), `LVP`/`LVD`/`LVDT` (team-score change chip) |
| `MS` | Sub-page inside More: `'h'` (History), `'pw','pwd','pair','pay','r','a','th','i','ph'`, or `null` (`'lb'` is legacy and no longer in the menu) |
| `PF` | Player profile open on Teams `{ti,pi}` or `null` |
| `TE` | Teams tab in roster-edit mode (bool) |
| `PWD` | Power-ranking detail player `{ti,pi}` |
| `PAIRD` | Pairing-optimizer state |
| `MY` | Matches tab year (2027 default) |
| `LBD` | Leaderboard round filter on Scoreboard (`'All'`,`'Friday'`,`'Saturday'`,`'Sunday'`) |
| `LBM`,`LBK` | More → Leaderboard mode/sort key (`LBKS`: Avg net, Avg gross, Best round, Points, Win %, Payouts, Titles, Rounds) |
| `PY`,`PVIEW` | Photo album year / open photo id |

`go(t)` switches tab and clears `LV`, `MS`, `PF`. `LB` maps tab keys to header labels.

### Bottom tab order (MUST stay): **Teams, Leaderboard, Scoreboard, Matches, More** (changed by the owner Sept 30, 2026: Leaderboard replaced History, which moved into More)

### Scoreboard (`stand(c)`)
1. "Overall summary" header + **"Enter admin mode"** link (just opens More → Admin; there's no password).
2. Team names + 2027 team logos, big score blocks (`.sb2`) with "**N PROJECTED**" under each (`projd()` projects unfinished Nassau segments from current hole status).
3. **"{Day} · Points in play"** — only matches in progress for the *current day*. `curDay()` = first day whose matches aren't all finished (auto-detected from match progress, **not** the calendar). Match cards via `mcard()`.
4. Note: "See every match, past and upcoming, on the Matches tab."
5. Leaderboard block (`lbHtml()`) with Round dropdown (All / Friday / Saturday / Sunday). All = Net, +/-, Holes. Per-day = F9, B9, Tot, +/-, Thru.
6. **Individual Awards** (auto from 2027 points): **Sunshine** (most points on leading team), **Gerry Bertier** (most points on trailing team), **Alan Bosley** (fewest points on trailing team).
7. **Stats & Side Games** (`sideAwards(curDay)`): The Alpha, The Beta, Birdie Machine, Mr. Consistent, Hot Start, The Closer, Hacker.
- **No Nassau boxes/labels on Scoreboard. No Upcoming/Finished sections.**

### Matches tab (`matches()`)
- Top: **Event year** dropdown (2027 current, 2026, 2025, 2024).
- **2027 (`cur()`)**, per day: section header "Friday: a to b", course name + location, (Sunday only) **Sunday course picker** (`S.crs.Sunday`, "Not yet assigned" + 3 Bear Trap combos). Each match card shows player avatars, `rivalCard(m)` (head-to-head blurb), "Thru N holes", three Nassau rows (Front 9 / Back 9 / Overall with point values; tap → `slot()` sheet to manually set/clear a result), buttons **Select players** (`lineup(mi)`) and **Live scoring** (`live(mi)`). When a day is finished, `dayAwardsBlock(day)` shows that day's final side-game awards.
- **Live scoring view** (`liveView()`, when `LV` set) — see §6.
- **Past years (`old(y)`)**: `res(y)` final hero with that year's team logos + session results; `res24(y)` for 2024 format; scores table (Round 1–3, Total, Average; gross & net) with course names; `awd(y)` team awards; `summary(y)`.

### Teams tab (`players()`)
- Default `rosterView()`: "Edit roster" button; per team a card with team logo, players (avatar, name, "Index X · Power rank #N") → tap opens `profilePage()`.
- `rosterEdit()`: team name input, per player: photo upload (tap avatar; ✕ removes), HCP input, name input, ✕ remove; "+ Add player".
- `profilePage(ti,pi)`: power rating/rank, career stats, match history 2025–2027 (`matchHist`), head-to-head (`rivalsCard`, rival = ≥3 meetings, `RVMIN=3`), past scores (`scoreHist`), payouts (2027 estimate + historical `PAYH`/`PAYD`), Edit roster button.

### History tab (`history()`)
- "All-Time Records": `teamAll()` all-time team wins (`TW = {Lutz:[], Guad:[2025,2026]}`), `tbl('bb','Best Ball')`, `tbl('mp','Match Play')` (sortable headers via `hs()`), explanatory note, then Scoring log (`slog()`).
- Records are **computed** from `RES` (2025, 2026) + live 2027 matches via `allPts()` — best-ball partners each get the full match points.

### More tab (`more()`) menu → `MS` key
*(8 items, in this order per the owner: Power rankings, History, Payouts, Rules, Photo album, Appearance, Install app, Admin. Leaderboard is now a bottom tab, not a More item. "Change access code" now lives inside Admin, not in the More menu.)*
| Item | MS | Function |
|---|---|---|
| Leaderboard — "Net scores across every player" | `lb` | `leaderboardPage()` |
| Power rankings — "All 14 players ranked 1 to 14" | `pw` | `rbPage()` → detail `pwd` `rbDetail()`, optimizer `pair` `rbPairPage()` |
| Payouts | `pay` | `payoutsPage()` |
| Rules | `r` | `rules()` (read-only text `S.rules`) |
| Admin | `a` | `admin()` |
| Appearance | `th` | `themePage()` |
| Install app | `i` | `installPage()` |
| Photo album | `ph` | `photosPage()` |
| *(Change access code)* | *(button inside Admin)* | `changeCode()` prompts for the event code. The real code = can edit; anything else = view-only |

Admin (`admin()`) contains: Event name; **Access code** (Change access code button);  **Nassau setup** per day (format name + F/B/Overall point values, applies to all that day's matches); **Payouts setup** (per day Front/Back/Overall pots + Best ball each; Ryder Cup each); **Tees and course handicaps** (`teesAdmin()`, per day per player tee picker + live CH text); **Power Ranking settings** (`rbConfigCard()`); **Rules text** textarea; **Reset all scores** and **Clear history** (both require a second tap to confirm).

---

## 5. Data structure

### 5.1 `S` (localStorage `rbc_v2`)
```js
S = {
  event: 'Ronnie Bass Classic',
  teams: [                       // index 0 = Team Lutz (A, red), 1 = Team Guad (B, teal)
    { n:'Team Lutz', p:[names], h:[handicap index strings], c:[hometown/notes strings] },
    { n:'Team Guad', p:[...],   h:[...],                    c:[...] }
  ],
  matches: [ /* 13 matches, see 5.2 */ ],
  sc:   { Friday:{ 'ti_pi':[18 gross or null] }, Saturday:{...}, Sunday:{...} },  // hole scores
  tees: { Friday:{ 'ti_pi':'Blue' }, ... },       // chosen tee per player per day
  crs:  { Sunday: 'Grizzly / Kodiak' | '' },      // Sunday course selection
  pay:  { Friday:{f,b,o,bb}, Saturday:{f,b,o,bb}, Sunday:{f,b,o,bb}, grand:340, buyin:200 },  // bb = best-ball POT for the day (140), not a per-player amount
  payv2: 1,                                        // migration flag for 2027 payout amounts
  payv3: 1,                                        // migration flag: best-ball amount doubled from 70 "each" to a 140 pot
  rbpr: { /* overrides of RBDEF power-rating settings */ },
  awards: { },          // legacy manual awards (ctp/ld/bb/mc) — UI removed, keep key
  rules: 'text',        // default = DR constant
  log: [ {ts, m} ]      // scoring log, newest first, max 200 (lg())
}
```
Handicap strings accept plus handicaps (`"+2"` / `"plus 2"` → −2) via `pidx()`.

Default rosters (`RS`):
- **Team Lutz:** Lutz 18.5, Bryce 12.1, Tim 12, Nils 6, Bradio 6.1, Brett 27, Bill 33.4
- **Team Guad:** Guad 6, Justin 1.2, Belon 7, Mannone 19, Bustin 18, Weidaw 45, Fogel 22.7

Name alias used in history math: `AL = {Bradio:'Brad'}` (historical data uses "Brad").

### 5.2 Match object
```js
{ d:'Friday'|'Saturday'|'Sunday', f:'Best Ball'|'Singles', n:2|3|1 (players per side),
  s:[seg0, seg1, seg2],   // Nassau results: null | {w:'A'|'B'|'H'} | {w, auto:1}
  pv:[.5,.5,1] (Fri/Sat) | [1,1,2] (Sun),   // point value per segment
  l:[[pi,...],[pi,...]],  // lineups: player indexes for team 0 and team 1
  final: <timestamp> }    // optional; set by finalizeMatch(), removed by unfinalize()
```
Created by `mk()` in this fixed order (indexes matter — they're also DB doc ids `m0`…`m12`):
- `0,1,2` Friday: 2v2, 2v2, 3v3 Best Ball
- `3,4,5` Saturday: 2v2, 2v2, 3v3 Best Ball
- `6–12` Sunday: seven 1v1 Singles

Totals: Fri 6 pts, Sat 6 pts, Sun 28 pts → **40 points**.

**Finalization:** a match only counts as finished (`mFin(m)`) when all three Nassau results are set **and** `m.final` exists. When every segment is decided, the live view shows a "Ready to submit" card (`finalCard`) with **Submit final score** (`finalizeMatch(mi)`); afterwards it shows "Match finalized" with **Edit this match anyway** (`unfinalize(mi)`). `mFin` drives `curDay()`, Points in play, finished-day awards, payouts and Power Rankings.

`m.s[k].auto=1` means the result was set automatically from hole scores; manual results (no `auto`) are never overwritten by `sync()`.

### 5.3 Other localStorage keys
| Key | Content |
|---|---|
| `rbc_ppics_v1` | `PPICS` player headshots `{ 'ti_pi': dataURL }` |
| `rbc_theme_v1` | `'system'` \| `'light'` \| `'dark'` |
| `rbc_photo_yr_v1` | Photo album year |
| `rbc_nick_v1` | Uploader nickname for photos |
| `rbc_code` | This device's event access code (`EVENT_CODE`) |

### 5.4 Hard-coded constants (in the file)
| Const | Content |
|---|---|
| `DAYS` | `['Friday','Saturday','Sunday']` |
| `SEG` | `['Front 9','Back 9','Overall']` |
| `COURSE` | Friday **Plantation Lakes**, Millsboro DE (par 72, default tee Blue; tees Black/Blue/White/Gold/Red). Saturday **War Admiral**, GlenRiddle, Berlin MD (par 72, default Blue; tees Black/Gold/Blue/Blended/White). Each: `n, loc, p, def, par[18], hcp[18], tees:{Name:{r (rating), s (slope), y[18] yardages}}`. `COURSE.Sunday` is a **getter** returning `SUNCOURSES[S.crs.Sunday]`. |
| `SUNCOURSES` | Bear Trap Dunes, Ocean View DE: `'Grizzly / Kodiak'`, `'Black Bear / Grizzly'`, `'Kodiak / Black Bear'` (tees Championship/Back/Club/Forward, default Back). |
| `RES` | 2025 & 2026 final scores `f:[Lutz,Guad]` and sessions `s:[[title, rows[[sideA,ptsA,ptsB,sideB]], course]]`. 2026 = 16–20 Guad; 2025 = 7–10 Guad (2025 Friday was a Stableford session). |
| `SC24`,`SC25`,`SC26` | Per-player rows `[name, g1,n1,g2,n2,g3,n3, totG,totN, avgG,avgN]` |
| `CRS` | Courses per year: 2026 Rum Pointe / Lighthouse Sound / Eagles Landing; 2025 Glen Riddle / Baywood Greens / River Run; 2024 Baywood Greens / Rum Pointe / Man O War |
| `OLD`, `TY`, `TW` | Year→scores map; team membership per year; all-time team wins |
| `PAYH`, `PAYD` | Historical payouts (2025 totals by name; 2026 itemized in `PAYD`, summed into `PAYH`; 2024 empty) |
| `TL`, `TL25`, `TL26` | Team logo data URLs (2027 current / 2025 / 2026) `[Lutz, Guad]` |
| `DEFPICS` | Default headshots by player name (seeded into `PPICS` by `seedPics()`) |
| `RBDEF` | Power-rating defaults `{h25:.4,h26:.6,prog:[[0,0],[1,.30],[2,.45],[3,.55],[4,.65],[5,.75]],sammatch:.7,hcpperf:.4,winsZ:2.5,scoreSpread:15,eloD:15}` |
| `DR` | Default rules text |
| `TT` | Legacy manual award labels (ctp/ld/bb/mc) — not shown on Scoreboard anymore |

### 5.5 Startup migrations (keep these; add new ones the same way)
- Rules text: old "Every match is worth 1 point" → `DR`; removes CTP/LD sentence; renames King Crab/Soft Shell/Bottom Feeder → Sunshine/Gerry Bertier/Alan Bosley.
- Team names "Team Old Bay"/"Team Coastal" → "Team Lutz"/"Team Guad".
- `fixRoster()`: placeholder "Player N" rosters → real `RS` rosters.
- Adds missing `h`, `c`, `pv`, `sc`, `tees`, `crs`, `log`.
- `payv2` flag: resets pay amounts to 2027 values once.
- `fix99()`: old pickup value `99` → double par + 2; appends max-score rule to rules text.

---

## 6. Live scoring & multi-user interaction

### 6.1 Entering scores (`live(mi)` → `liveView()`) — new hole-by-hole screen (Sept 30, 2026)
Designed and approved by the owner from an interactive mockup. While a match is open (`LV` set, `tab=='m'`) `render0` adds `body.live`, which **hides the bottom nav and the app header** (CSS `body.live nav, body.live header{display:none}`); the ✕ button exits (`LV=null`). The previous screen is kept as `liveViewOld()` (not called) for reference.
- `LV = {mi, h, k, tab, follow, look, more, hist}`: match index, hole 0–17, selected player key `"ti_pi"`, current tab (`'hole'|'card'|'stat'`, default hole), follower mode, "looking back" flag, More-numbers toggle, undo history (max 60).
- Opens on the first empty hole/player. If lineups are missing → prompt to "Select players". If the day's course isn't set (Sunday) a warning card says strokes are not counted yet.
- **Top block** (navy `.lvt`): ✕, match label + course/tees, **FOLLOW/SCORE** pill and a small sync status (LIVE/OFFLINE/CONNECTING/LOCAL; "VIEW ONLY" when `SY=='ro'`). Two team blocks (red/teal) each showing the team's **live Ryder Cup points** (`calc().t`) and **PROJ** (`t + projd()`), same numbers as the Scoreboard; a gold `+½` chip appears for ~2.6 s when a team's points increase (`LVP`, `LVD`, `LVDT`). Under them: overall status ("LUTZ 2 UP · thru 5") and three Nassau chips (Front 9 / Back 9 / Overall with points value).
- **Tabs:** Hole | Card | Status (`lvTab`).
- **Hole tab:** two rows of 9 hole circles (red/teal = team won, grey = halved, dashed = partly scored, gold ring = current; `holeGo(i)`), hole header with ‹ › (`holeGo(h±1)`; PAR and STROKE INDEX), a result banner **above** the rows ("Waiting on Justin" / "LUTZ wins the hole · best net 3 vs 4" + **Undo**), then one row per player (`.lvr`: avatar, name, stroke dots/“no stroke”, `net n`, big score in the existing `.sq` shapes). Tap a row to select it (`pick`).
- **Docked keypad** (`.lvk`, sticky bottom): label "Player · hole · par", **Clear**, five keys: par−1 Birdie, par, par+1 Bogey, par+2 Double, **More** (reveals the other numbers up to double par + 2). Max score is still **double par + 2**; **no pickup/X button**.
  - `kp(n)` sets the selected player's score (tapping the same number clears it), calls `sync`, then `lvAdv`: moves to the next player without a score on that hole; when the hole becomes complete it shows the result banner and **auto-advances to the next hole after 1.1 s** (`LVT` timer; cleared by any manual navigation, `pick`, tab change or Undo). After hole 18 it opens the Status tab. Editing an already-complete hole does not auto-advance.
  - `lvUndo()` restores the last entry (and returns to that hole); `lvClr()` clears the selected cell.
  - `kp`/`lvClr` do nothing when `SY=='ro'`.
- **Card tab:** the previous scorecard grid (`table.sg`, horizontally scrolls, centers on the selected cell via `ctr()`) plus the legend. Tapping a score or a hole header jumps to the Hole tab at that cell (`lvPick`, `holeGo(i,1)`).
- **Status tab:** `finalCard` (Submit final score / Match finalized + Edit anyway), the Nassau card, and the Tees & strokes card (`teeCard`, per-player tee dropdown → `setTee`).
- **Follower mode** (for people watching): FOLLOW pill (or automatically when view-only) hides the keypad and row selection and **auto-jumps to the latest scored hole** whenever data changes (`lvLast`). Browsing a hole sets `LV.look`; "Jump to live" (`lvLive`) resumes following.
- `lvScroll()` (called from `render0`) keeps the selected row visible above the keypad.
- Old helpers still exist and are used elsewhere/tests: `ch`, `sc`, `step`, `hole`, `clr1`, `ctr`, `sm`.
- After each entry `sync(m,mi)` recomputes Nassau segments.

### 6.2 Match math
- `pidx(v)` → numeric index. `chd(m,ti,pi)` = **WHS Course Handicap** = `round(Index × Slope/113 + (Rating − Par))` for that player's tee (`tee()`; default `c.def`).
- `stk(m)` = match strokes: lowest CH in the match plays **scratch (0)**, others get the difference.
- `gs(n,c,h)` = strokes on hole h. Positive strokes go on the hardest holes first (stroke index 1, 2, ...); a **plus handicap (negative n) gives strokes back on the easiest holes first** (stroke index 18, 17, ...); handles more than 18. Fixed Sept 30, 2026: it used to put plus strokes on the hardest holes. Only individual net (`roundNet`: leaderboard, Front/Back payouts, round awards) uses negative n; match play uses strokes relative to the lowest handicap, which are never negative.
- `best(m,ti,h)` = side's best **net** on hole h (only when **every** player on that side has a score).
- `holes(m)` → per hole `'A'|'B'|'H'|null`. `seg(m)` → front/back/overall `{a,b,p,w}` with early clinch detection (`w` set once lead > holes remaining).
- `sync()` writes `m.s[k]={w,auto:1}` when decided; clears auto results if scores are removed; logs to `S.log`.
- `mst(m)` status text ("Team Lutz 2 up thru 11", "won 3&2", "All square thru 9", "Halved").
- Lineup picker `lineup(mi)`/`tg()`: pick `m.n` players per side; **a player can play only once per day** (hard-blocked; already-used players shown disabled "In Friday match 2"); shows Index, CH and tee.

### 6.3 Multi-phone sync (IMPORTANT)
- **Backend = Firebase Firestore + anonymous Auth** (SDK 10.13.0 compat scripts in `<body>`). `FIREBASE_CONFIG` (project `ronnie-bass-classic`) is filled in near `initDb()`. Web config values are not secrets; access control is the security rules plus the event code. Never invent or alter these values. Setup is documented in `README.md`; rules are in `firestore.rules`.
- `initDb()`: `ensureCode()` prompts once for the event access code (stored in `localStorage['rbc_code']`), enables Firestore offline persistence, signs in anonymously. If the SDK is missing/blocked, `DB=null` and status is **"Local"**.
- **Status badge (`setSy`)**: `live` "● Live", `off` "● Offline (saved on this phone)", `connecting` "Connecting…", `ro` "View only" (write rejected, e.g. wrong/missing code), `local` "Local".
- **Documents:**
  - `match/m0` … `match/m12`: **field-level**. Fields per match (`fkeys(i)`): `struct` (JSON of `{d,f,n,pv,l,s,final}`), and for each lineup player `sc_{ti}_{pi}` (their 18 scores) and `te_{ti}_{pi}` (their tee). Each field has a `<field>_v` version timestamp, and every write includes `code`.
  - `meta/main` → `{ j: JSON({event, teams, rules}), v, code }` (whole-doc).
  - `playerphotos/{ti_pi}` → `{img}`; `photos/{auto}` → `{year, img, ts, by}`.
  - `config/access` → `{ code }` (created by hand in the console; not client-writable).
- **Push:** `pa()` (called from `save()`) compares each field's JSON to the last-synced value (`LP`) and writes changed fields after a debounce (~500 ms for `struct`, ~900 ms for others) via `fl()`, using `set(..., {merge:true})`. Per-field busy lock (`BZ`).
- **Pull:** `onSnapshot` on `match`, `meta/main`, `playerphotos`. `apField()` ignores stale versions and any field with an unsent local edit; `meta` is skipped while an input/textarea/select is focused. `fapply()` writes the incoming field into `S`. `applyMatch()` is a legacy whole-doc loader kept for old saves.
- **Conflicts:** two people editing **different players** never collide. Two people editing the **same player's same field** at the same time: the later write wins on both devices.
- **Write access:** rules require a signed-in device and `code` equal to `config/access.code` for `match` and `meta`. Anyone can read. `photos` / `playerphotos` are writable by any signed-in device.
- **Not synced (local to each phone):** `S.crs` (Sunday course choice), `S.pay` (payout amounts), `S.rbpr`, `S.log`, `S.awards`, theme, nickname. Tees **are** synced per lineup player via `te_` fields.
- **Verified:** a score entered on the desktop site appeared on a phone (owner test, Sept 30, 2026).
- **Reliability layer (added Sept 30, 2026 after multi-phone load testing):**
  - **Versions:** `nextV(key)` = one more than the highest version seen for that field (clock is only a fallback) plus a per-phone fraction `DEVF`. This stops a phone with a wrong clock from making everyone else reject its updates.
  - **Errors:** only `permission-denied` (wrong/missing code) latches "View only". Any other write error keeps the edit, shows "Connecting…", and retries with back-off (`HOLD`/`RT`, max 15 s). Dead listeners (`bad()`) re-subscribe themselves. Before this, one temporary server error left every phone stuck in "View only" and scores stopped syncing.
  - **Results:** phones that have written to a match (`WROTE[mi]`) re-derive decided Nassau results when other players' scores arrive (`apField`, upgrade-only, never clears). Previously results could stay blank when each player entered their own score.
  - **Redraws:** remote updates redraw through `rr()` (batched, waits until the user stops tapping), so an incoming score can't eat a tap.
  - **No blank writes:** `pristine()` stops phones from writing an untouched match's default record on first open.
  - **Crash guard:** `render()` wraps `render0()`; a page error shows a "Something went wrong / Reload" card and logs `ERROR ...` to the Scoring log (History tab). Global `error` / `unhandledrejection` handlers log there too.
  - **Photos:** the album now subscribes when More → Photo album is opened, not on every app start.
  - Test harness idea (not in repo): run `index.html` N times in Node `vm` contexts against an in-memory Firestore mock; inject clock skew, write outages and listener errors.

---

## 7. Tournament / team / player structure
- 2 teams × 7 players. Team 0 = **Team Lutz** (color red, key `A`), Team 1 = **Team Guad** (teal, key `B`). Helpers: `C(i)` → 'A'/'B', `V(i)` → 'red'/'teal'.
- **Friday** (Plantation Lakes, Blue tees default) and **Saturday** (War Admiral, players pick tees): two 2v2 + one 3v3 **best ball**, Nassau ½ / ½ / 1.
- **Sunday** (Bear Trap Dunes, 18 not yet assigned): seven 1v1 **match play singles**, Nassau 1 / 1 / 2.
- Halved segments split points. Team totals from `calc()` (also per-player points `pp`, used by awards).
- All-time: Team Guad 2 titles (2025, 2026), Team Lutz 0.

---

## 8. GPS / course functionality
- **There is NO GPS, geolocation, maps, or distance-to-pin feature in the current app.** No `navigator.geolocation` calls exist.
- "Course functionality" = hard-coded scorecards in `COURSE`/`SUNCOURSES`: par, hole handicap, and per-tee rating/slope/yardages. Yardages are only used for the tee total in Admin → Tees table. Course/tee drive Course Handicap and stroke allocation dynamically (nothing hard-coded per player).
- Sunday course is chosen in Matches → Sunday picker (local per phone).
- If GPS is added later it's a new feature; would need green coordinates per hole (not present).

---

## 9. APIs & external services
| Service | Use | Notes |
|---|---|---|
| Firebase Firestore + Anonymous Auth (JS SDK 10.13.0 from gstatic) | Live sync, player photo sync, photo album | Works from any host (GitHub Pages). Writes gated by event access code + security rules. |
| Google Fonts | Barlow, Barlow Condensed | Fallbacks: system-ui / Arial Narrow |
| Firebase Storage | **Not used.** | Owner plans to move album photos here "later"; no Storage SDK is loaded. `storageBucket` is in the config only. |

No secret keys, no custom backend, no analytics. (Firebase web config is public by design.)

---

## 10. PWA functionality
- `manifest.json` (see §2) + `<link rel="manifest">`, icon link, `theme-color #0B3350`, `apple-touch-icon` (base64), `apple-mobile-web-app-capable`, status bar `black-translucent`, title "Ronnie Bass", `viewport-fit=cover`, safe-area padding on `:root`.
- More → **Install app** (`installPage()`): captures `beforeinstallprompt` → "Install now" button (`doInstall()`); iOS shows Share → Add to Home Screen instructions; detects already-installed (`display-mode: standalone` / `navigator.standalone`).
- `sw.js` is registered on `window` load (`navigator.serviceWorker.register('./sw.js')`). Network-first, so updates show when online; **bump `CACHE` in `sw.js` on every release** so installed home-screen copies refresh.

---

## 11. How index.html is laid out (top → bottom)
1. `<head>`: meta tags, Google Fonts, `apple-touch-icon` (`icon-192.png`), `manifest.json` link, theme-color, PWA metas. (Well-formed.)
2. `<style>`: CSS variables + all component classes (`.card .sec .hero .sb2 .mx .mc2 .aw .ag .op .add .rs .sg .sgw .ep .cb .lbt .pgrid .pthumb .rowp .pc .av .sy .mi .mr .res` etc.).
3. `<body>`: header, `#main`, nav, `#ov/#sh`.
4. `<script>` roughly in this order: constants & `esc` → `RS`, `mk()`, `S` load/defaults/migrations, `DR` → `save` → logos `TL`… → `res()`/history data (`RES`, `SC2x`, `CRS`, `OLD`, `TY`, `TW`) → `history()`, `teamAll()`, `tbl()` → `COURSE`, `SUNCOURSES`, `COURSE.Sunday` getter → match math (`gs`, `pidx`, `tee`, `chd`, `stk`, `best`, `holes`, `seg`, `sync`) → live scoring (`live`, `liveView`, `pick`, `step`, `ch`, `sc`, `clr1`) → match cards (`mcard`, `plist`, `mst`, `mrow`, `mbd`, `mlab`) → player photos (`PPICS`, `DEFPICS`, `seedPics`, `setPhoto`, `pickPPic`, `avatar`) → sync (`FIREBASE_CONFIG`, `ensureCode`, `changeCode`, `initDb`, `pa`, `fl`, `apField`, `fkeys`, `fval`, `fapply`, `jm`, `applyMatch`, `setSy`) → `more()`, install, theme → Scoreboard (`stand`, `calc`, `render`, `go`, `curDay`, `projd`, `recs`) → leaderboard/stats (`roundNet`, `dayPlayerStats`, `bagStats`, `bagStatsDay`, `dayBoard`, `lbHtml`, `sideAwards`, `topBy`, `dayDone`) → payouts (`payoutsPage`, `bbPairs`, `potCard`, `usd`) → power ratings (`rb*`) → Teams/profile (`players`, `rosterView`, `rosterEdit`, `profilePage`, `matchHist`, `scoreHist`, `meetings`, `rivalsCard`) → Matches (`matches`, `cur`, `old`, `awd`, `summary`) → Admin (`admin`, `teesAdmin`, `fmt`, `pv`, `setPay`, `reset`, `clr`) → photo album (`pSub`, `pShrink`, `pBudget`, `addPhotos`, `photosPage`) → `render(); initDb(); pSub(PY);`
   (Exact order may differ slightly; search by function name.)

---

## 12. Important functions & logic (quick reference)

**Core:** `render()`, `go(t)`, `save()`, `sheet()`, `shut()`, `lg(msg)`, `esc()`, `lab(mi)` ("Friday match 2"), `calc()` → `{t:[teamPts], pp:[[playerPts]], n}`.

**Scoring:** `live`, `liveView` (new), `liveViewOld` (unused), `kp`, `lvAdv`, `lvUndo`, `lvClr`, `lvTab`, `holeGo`, `lvPick`, `lvFollow`, `lvLive`, `lvMore`, `lvScroll`, `lvLast`, `lvFirst`, `lvDone`, `ch`, `sc`, `step`, `pick`, `hole`, `clr1`, `sync`, `seg`, `holes`, `best`, `stk`, `chd`, `gs`, `pidx`, `tee`, `teeOfD`, `chDay`, `setTee`, `setTeeA`, `thru`, `mp2`, `mst`, `mbd`, `projd`, `curDay`, `lineup`, `tg`, `slot`, `setS`.

**Net stats (leaderboard/awards/payouts):** `roundNet(day,ti,pi)` uses each player's **full Course Handicap** (not match-relative strokes); a day with no course loaded scores gross as net. `dayPlayerStats`, `bagStats`, `bagStatsDay`, `dayBoard`, `topBy`.

**Side-game awards (`sideAwards`)** — code names: **The Alpha** (lowest net; renamed from "Big Dog"), **The Beta** (highest net; renamed from "Just Go Home"), **Birdie Machine** (most gross birdies), **Mr. Consistent** (longest net-par streak), **Hot Start** (best net first 5 holes), **The Closer** (best net last 5 holes), **Hacker** (most net bogey-or-worse). Ties shown as "· tied".

**Payouts (`payoutsPage`)** — 2027 amounts (from `S.pay`): Fri & Sat **Front 9 $21, Back 9 $21, Overall 18 $28** (lowest individual net for that segment; pot split on ties; Front needs thru ≥9, Back/Overall need thru 18); **Best Ball $140 pot per day** (Fri & Sat), shared equally by the players on the single pairing/trio with the lowest net best-ball total that day from any match: a pair gets $70 each, a trio $46.67 each. **Ties:** the pot is split equally between the tied sides first, then within each side (two pairs: $35 each; pair + trio: pair $35 each, trio $23.33 each; pair + pair + trio: $23.33 / $23.33 / $15.56 each); **no Sunday payouts**; **Ryder Cup Champion $340 each** to the whole winning roster once all matches are finished (tie → both rosters split). Shows "Total payouts per player". Stores ledger in `PAYL` (`pay27()` calls `payoutsPage()` just to compute it). **Do not show or mention buy-ins** (`S.pay.buyin` exists in data; leave it hidden).

**Power rankings (RBPR):** `rbCfg`, `rbRounds`, `rbSam` (Strokes Above Median per round, winsorized), `rbPlayerSam`, `rbBlend` (2025/26 historical blended with 2027 by rounds played via `prog`), `rbMeetings`/`rbMatchRaw` (opponent-adjusted match play), `rbHandicap`, `rbNormalize`, `rbAll()` (returns ranked `players`), `rbTrend`, `rbSvg`, `rbBar`, `rbTeamPower`, `rbPage`, `rbDetail`, `rbConfigCard`. **Pairing optimizer:** `rbPairPage`, `rbSuggestBestBall`, `rbSuggestSingles`, `rbApplyPair(i,day)` (writes lineups), Sunday tee-group suggestions.

**History:** `allPts`, `career`, `meetings`, `rivalCard`, `rivalsCard`, `matchHist`, `scoreHist`, `awd(y)` (2025/2026 team awards: Sunshine = most points on the winning team, Gerry Bertier = most points on the losing team, Alan Bosley = fewest points on the losing team; ties → lower average net).

**Photos:** `PPICS`, `avatar(ti,pi,name,size)` (headshot or initials bubble), `pickPPic` (compress ≤ ~90 KB), `pSub(year)` (live query, limit 60), `addPhotos` (compress to ≤ ~180 KB data URL via `pBudget`/`pShrink`, stored **inside** DB documents), `delPhoto` (double-tap confirm).

**Theme:** `THEME`, `applyTheme`, `setTheme`, `themePage`.

---

## 13. External keys / configuration required
- **No secrets.** `FIREBASE_CONFIG` is already filled in and is public-by-design.
- The **event access code** lives in Firestore at `config/access` (set by hand in the Firebase console) and on each device in `localStorage['rbc_code']`. Don't print or invent it.
- If Firebase config, rules, or the Firestore data model change, update `README.md` and `firestore.rules` too and tell the owner which files changed.

---

## 14. Recently added (latest work, roughly newest first)
- **Firebase live sync:** replaced the claude.ai-only DB with Firestore + anonymous auth, per-player field-level sync, offline cache, event access code (More → Change access code), `README.md`, `firestore.rules`.
- **Match finalization:** "Submit final score" / "Edit this match anyway" (`m.final`); a match only counts as finished once finalized.
- **Service worker:** registered; saved-copy-first (`rbc-shell-v36`). `<head>` fixed.
- **Plus-handicap fix:** `gs()` now places plus-handicap give-back strokes on the easiest holes (verified against the rule for every stroke count from -54 to +72 on all courses). Affects Justin on several tees and Nils/Bradio/Guad/Belon on Red/Forward tees.
- **Best Ball payout is now a $140 pot per day** shared by the winning side (pair $70 each, trio $46.67 each; ties split between sides first). Stored amounts migrate once via `payv3` (70 -> 140). Admin label is "Best ball pot". Tested: outright pair, outright trio, two-pair tie, pair+trio tie, three-way tie, two-trio tie.
- **Sportsbook-style live odds on the Scoreboard (cache v32, BUILD 24, Oct 2, 2026).** The win-chance bar became US moneyline odds with a sportsbook margin; owner decisions: **sportsbook style, US format only (no format switch), Scoreboard only (no odds on the Matches tab or the live scoring screen)**. `oddsBox()` replaces `winBox()`: a "Ryder Cup odds" card with Team Lutz, Team Guad and Tie rows (one odds button each, roster names underneath) plus the thin probability bar (fair chances, no margin), the "needs X more" line and a "How these odds work" note. Each in-progress match card on the Scoreboard (`mcard` → wrapped in `.mxw`; only matches that have started, have both lineups and are not fully decided, never finished ones) gets one odds row under the existing card (team 1 button, "TO WIN", team 2 button; `.omo`) and a "More odds ›" link (`oddsTog(mi)`, `ODDSOPEN`) that opens match result (win / draw / win), Front 9, Back 9 and Overall odds and a line chart of the first team's win chance after each hole (`winSeries` replays the hole results; nothing is stored). `usOdds(p)`: margin `ODD_VIG`=4.5 percent (an even match shows −110 / −110), rounded to the nearest 5 (25 above 300, 100 above 1000), capped at −5000, "OFF" for a dead outcome and a check mark for a certain one. `oPill()` remembers the last chance shown for every button (`OP`) and flags a change (`OF`): a green ring and ▲ when the team got shorter, a red ring and ▼ when longer, kept for 9 seconds (one timer, `ODT`) and the first 2 seconds animated; changes since the last time the page was drawn show too. `winMatch(m,sA,sB,R0,noFix)` now also returns the match result split (`res`) and the Front/Back/Overall splits (`fr`, `bk`, `ov`); `winCtx()` holds the ratings. Model parameters unchanged (`WIN_D`, `WIN_K`, `WIN_PH`). Recap cards keep their percent bar. Style classes `.ob .otr .opl .omo .omore .oex .orow3 .osg` (not `.mo`, which the live keypad's More key uses). Tests: `scen_odds2.js` (every match-level probability within 0.31 points of a 250,000-trial independent simulation at seven match states; conversion checks), `scen_odds.js` (event level, unchanged), `oddsview.js` (browser: hero and card odds, expansion, movement arrows appear and clear, zero odds elements on the Matches tab, live scoring screen and Power rankings).
- **Betting: later days hidden, and the money bet moves the lines (cache v36, BUILD 25, Oct 2, 2026).** Two owner requests. **(1) Hidden future-day lines:** `betVisible(id)`: the Saturday lines (lowest net round Saturday, best ball Saturday) only appear once Friday is complete (`dayDone('Friday')`, every Friday match submitted) and the Sunday line once Saturday is complete; a muted note at the bottom of the Lines tab says so. Cup, weekend lowest net, Friday lines and the three honors are always shown. Hidden lines cannot be bet on (`betPick`/`betPlace` use `betLive()`, which filters them). A bet already placed stays listed under My bets and settles normally even if a match is later reopened and the line hides again. **(2) Odds follow the betting:** `betFlow(mk,L,cfg)` pulls each selection's chance toward its share of the money bet on that line by everyone: `p' = (1-a) p + a * (money share)` with `a = w * 0.30`, `w = money / (money + 1500)` (`BET_FLOW_K`, `BET_FLOW_MAX`), so a few small bets barely matter and heavy backing shortens the price clearly (tested: six 150-credit bets on one man for Sunshine took him from +1500 to +450, every other selection got longer, the line still adds to 100 percent). Selections the model says are dead (below 0.4 percent) are not revived and bets on them do not count; a decided line and a line with betting-movement switched off are untouched. The model chances are cached and repriced slowly (`betMarkets`, `betReady`), the betting adjustment is cheap and applied on every draw (`betLive()` = visible lines with `betFlow`), so every phone shows the identical price from the shared `bets` records. Prices stored on a bet are the price when it was placed and never change. The movement arrows (`oPill`) show when betting moves a line. A card shows "Most bet: name (share of N credits)". **Admin > Betting** has a new switch **Betting moves the odds: On/Off** (`S.bet.flow`, default on). The Scoreboard odds (Ryder Cup and match odds) are still the pure model and are NOT moved by bets, so the Cup winner line in Betting can differ from the Scoreboard. Tests: `scen_bet4.js` (visibility timeline, formula equals an independent calculation to 0, keep-betting example, properties, dead selection), `scen_bet5.js` (three people on three phones under the new rules: identical moving price everywhere, stored prices each worse than the last), `scen_bet3.js` updated (Saturday and Sunday bets are placed only after the day before is done).
- **Betting menu (cache v35, BUILD 25, Oct 2, 2026).** New **More > Betting** (`MS='bet'`, `betPage()`), **play credits only** (nothing moves real money; the app only tracks credits). Owner request: lines built from historical data that move as the weekend's data comes in, for: Cup winner, Lowest net round of the weekend, Lowest net round each day (Fri, Sat, Sun), Best ball team (Friday and Saturday; opens only once that day's lineups exist), Sunshine, Gerry Bertier, Alan Bosley. **Page:** first asks "Who are you?" (a roster name or free text, kept on the phone in `rbc_bettor`; honor system, no accounts), then a balance strip (available / in play / profit), tabs **Lines / My bets / Leaderboard**, a market card per line with an odds button per selection (top 4 then "Show all"), and a bottom **bet slip** (`betSlipHtml`, role dialog: stake chips 10/25/50/100/Max, stake box, "to win / returns", Place bet). **Admin > Betting** (`betAdmin`): starting credits (default 1000), most per bet (250), Close/Open betting, and the latest bets with **Void**. **Settings** live in `S.bet` inside the shared settings record (`meta/settings`, with `closed` and `archive`) and in backups (`bet`, `betsLocal`). **Bets** are one Firestore record each in a new **`bets`** collection (`{w,m,s,k,o,p,t,v}`: who, market, selection, stake, American price, fair chance at the time, time, version), created by registered editors only, never updated, deleted by editors (Void); `cleanBet` drops malformed records (bettor names are limited to letters, digits, space, dot, apostrophe, hyphen); practice and local-only mode keep bets in `S.betsLocal` instead. **`firestore.rules` must be republished** for betting to work; with the old rules a bet attempt shows "Betting is not switched on in the database yet" and stores nothing. **Pricing (`betMarkets`, `betMarketsG`, `betReady`):** a model per player from `SC24/25/26` (net minus the field's mean net in each round, shrunk by n/(n+4), per-player spread shrunk toward the pooled spread, clamped 2.5 to 6.5) plus the 2027 rounds already played; rounds already finished are fixed, rounds in progress are net-so-far plus expected remaining holes with spread scaled by the holes left, a shared day effect (sd 1.5) links all players on a day, and every round is rounded to a whole net score so ties (dead heats) appear. Lowest net round markets are simulated (`betSimNet`, 12,000 trials, typed arrays, deterministic seeds so prices only move when the data moves); best ball team totals use each hole's best of the side's players as a minimum of normals (Clark's formulas, `betMin2`) summed over holes, then a 20,000 trial team-total simulation (`betSimBB`); Sunshine, Gerry Bertier and Alan Bosley come from simulating all 13 matches from their match models (`winJoint`, lineups from the pairing optimizer `rbSug` for days not yet set) and awarding the three honors per weekend (`betSimEvents`, 6,000 trials); the Cup winner uses the existing `winOdds`. Margin: 4.5 percent on the Cup line, 10 percent on multi-runner markets (`BET_VIG_FUT`); shared price function `betPriceNum` (also behind `usOdds`); prices rounded like the Scoreboard, capped at +20000 and −5000, "OFF" below 0.4 percent, a check mark when decided. Simulations are generators that hand control back every few hundred trials and are repriced at most every 8 seconds while scores flow in, so a phone never freezes (`betStep`, `BETGEN`). **Settlement (`betResolve`, `betOut`, `betBank`):** each phone settles from the results, no settlement writes: Cup when all 13 matches are submitted; a day's lowest net when that day's matches are all submitted (same rows as the Alpha award); the weekend line when all three days are done; best ball when the day is done (same totals as the best ball pot, `bbPairs`); Sunshine, Gerry Bertier and Alan Bosley from `awardsAll` when everything is submitted; no winner (for example an exact Ryder Cup tie) refunds every bet. A tie for the win is a **dead heat**: payout = stake / winners x decimal price. Balance = start + settled profit - open stakes. Bets are open at the price shown when placed (the slip re-prices and asks for a second tap if the odds moved), blocked when betting is closed, the event is closed, the phone is view only, the stake is over the maximum or over the available credits. **Known simplifications, stated honestly:** scores in the same round and match outcomes are simulated independently; there is no betting lock before play (lines stay open while scores come in, so someone who already knows a result before it is entered could exploit a stale line; the commissioner can close betting or void bets); identities are not verified; credits are not real money. Tests: `scen_bet.js` (player model equals an independent derivation, lowest net lines within 0.56 points and best ball within 0.23 of independent simulations, the three event honors within 1.5 of an independent aggregation, settlement of a finished weekend equals winners worked out from raw scores for all 10 markets, payout arithmetic for wins at plus and minus odds, losses, dead heats and refunds, bankroll), `scen_bet2.js` (4 phones under the new rules: 4 bets visible and identical leaderboards everywhere, watch-link phone refused, no access code in any bet record, stranger and malformed bets denied, void, slip checks, old rules message, hostile records dropped), `scen_bet3.js` (lines move the right way after Friday and during Saturday; bets placed before the weekend settle to an independent total), `betview.js` (browser: menu entry, who-are-you, pricing, slip, balances, no horizontal scrolling at 390 px, 0 accessibility violations in light and dark).
- **Scoreboard odds simplified (cache v34, Oct 2, 2026).** The owner asked to drop the bar and the breakdown: the "Ryder Cup odds" card is now just one row directly under the score blocks, `oddsBox()` = `.obx`: Team 1 odds button, a small "WIN ODDS" label, Team 2 odds button (`OP` keys `e0` and `e1`, same movement arrows). Removed from the hero: the Tie row, the roster lists, the probability bar, the "needs X more" line, the "How these odds work" note and their styles (`.ob .och .otr .odot .onm .wc*`, `pctTxt`). The per-match odds, "More odds ›" panel and the factors list are unchanged. The tie chance is still computed (`winOdds().t`) and the recap cards still show their percent bar. `oddsview.js` now also asserts nothing but the two buttons sits above the match list.
- **Odds factors: day of week, partners, singles history, front/back nine, today's form (cache v33, BUILD 24, Oct 2, 2026).** The odds model (`winParams`, `winMatch`) now takes a factor object per match from `winFactors(m,cx)` (cached in `cx.fx(m)`; history parsed once in `winHist()`, cached in `WHC`; constants in `WF`). Match-level shifts to the expected result: **day of week** (`day`): each player's strokes better or worse than his own norm on that day (Fri/Sat/Sun) across all rounds in `SC24/25/26`, measured against the field median of each round, shrunk by n/(n+`DAYK`=10), 0.03 per stroke, cap 0.04; **partners** (`pair`): every teammate pair in a past match with 2 or 3 per side (`RES` 2025 and 2026; the 5-per-side Stableford is ignored) compared with what the ratings expected, shrunk n/(n+2), half weight, cap 0.06; **singles history** (`h2h`): past singles between the same two players, same treatment; Friday and Saturday have no singles. Per-hole shifts (0.10 win chance per stroke per hole): **front/back tendency** (`nF`, `nB`): from the EARLIER days of this weekend only (gross to par per hole, back minus front, minus the field's gap that day, shrunk by holes/(holes+27)); **today's form** (`form`): gross to par per hole so far today against the player's course handicap divided by 18, shrunk by holes/(holes+9), 0.35 persistence, needs 3 holes. The DP now uses a separate hole edge for each nine (`muF`, `muB`). `winReasons`/`reasonsHtml` fill a "What else is moving this line" list in the More odds panel (one line per factor with the effect in points of win chance and which team it favors; past partner and singles records are shown as win-loss, e.g. "Nils & Brad (Lutz) are 0–2 as partners in 2 past matches (latest 2026)"). **Limits, said honestly:** years before 2027 only have round totals (no hole-by-hole scores), so front/back tendencies cannot use history and only start after the first round of the weekend (Friday has none); `buildArchive` now also saves each round's front and back nine gross and par (`gf`,`gb`,`pf`,`pb`) so future years can; small samples are shrunk hard, so every factor is small (a partner record or a day effect moves a match by a few points at most); a 2026 back-test (factors built only from 2024 and 2025, 12 matches) lowered the mean squared error from 0.120 to 0.105, moving 12 matches and improving 9, but 12 matches is far too few to prove the factors help. Tests: `scen_odds3.js` (every factor equals an independent re-derivation from the raw saved data and live scores to 1e-9, partner records equal the raw match results, the hole model is within 0.17 points of an independent simulation, partners with a perfect record raise their side, zero weights return the rating-only model, 2026 back-test), `scen_odds.js` and `scen_odds2.js` (updated to simulate with the app's per-match hole parameters), `oddsview.js`/`oddsview2.js`.
- **Test note (Oct 2):** the awards oracle in `scen_awards.js` had two gaps, both fixed (a zero threshold treated as missing, and no case for an exact Ryder Cup tie, which the app correctly shares between both teams); 176 consecutive runs now show 0 differences.
- **Security lock-down, fast reopening, readability (cache v30 then v31, BUILD 24, Oct 2, 2026; audit improvements 1 to 3):**
  - **Security (`REGS`, `regDevice()`, `codeBit()`, `secCard()`, `SECURITY_SETUP.md`, `firestore.rules`, `storage.rules`).** The audit found the event access code readable by anyone (rules allowed reading `config/access`, and the old app saved `code` inside every `match/*` and `meta/*` record, which were world-readable) and any signed-in phone could plant a hostile photo record. Now each phone registers once at start-up (and after Change access code) in `writers/{its anonymous uid}` with the code; the rules check it against `config/access`, which no phone can read, and every write to scores, settings, photos and headshots requires a registration made with the CURRENT code (changing the code in the console switches off every phone until it enters the new one). Writes are limited to the fields the app uses (`hasOnly` lists for `match` m0 to m12, `meta` main and settings, `photos`, `playerphotos`), photo fields are validated (picture data or a Firebase Storage address, integer year, name up to 30 characters), `writers` and `config` cannot be read, and the app no longer sends the code (`codeBit()` sends `FieldValue.delete()` for `code` so records the old app wrote are cleaned as they are rewritten). **Transition safety:** if registration is refused (old rules still published, or a wrong code) the phone runs in `legacy` mode and sends the code the old way, so nothing breaks while the new rules are not yet published; Admin → **Database security** shows "Locked down", "Checking" or "Old mode". `pa()` and `flushNow()` wait until registration has an outcome (`REGS` 'ok' or 'legacy'); offline start waits and then pushes. The rules were NOT run against a real Firebase project (only a model of them in `tests/lib.js`); `SECURITY_SETUP.md` has the order of steps, a new access code, and Rules Playground checks. Deploy order: app files and `img/` first, then publish the rules, then set a new code in `config/access`, then every phone re-enters the code. Photo and headshot fields are cleaned before display (`SAFEIMG`, `cleanPhoto`); photos are opened and deleted by list position, not by text in a handler; upload and delete are hidden when `isRO()`; `esc()` now also escapes the single quote (it must never be used inside a quoted JavaScript string); the History table escapes names. Tests: `scen_sec.js` (14 phones under the new rules, strangers, wrong code, code rotation, old rules, leftover code cleanup, hostile photos), `xss4.js`, `leak.js`.
  - **Fast reopening and small page (`sw.js` rewritten, cache v30).** The app files are served from the phone's saved copy first and refreshed in the background (stale-while-revalidate); when the refresh finds a changed `index.html` (ETag or Last-Modified) the service worker posts `{t:'shell-updated'}` and the page shows "A new version is ready" (`UPDREADY`, `noticeHtml()`, `appUpdate()`). Pictures (`/img/`), Google Fonts and the Firebase SDK (`www.gstatic.com/firebasejs/`) are cached after first download, so the app starts offline. One missing file no longer stops the offline copy installing (`Promise.allSettled`). **All 21 embedded pictures were moved out of `index.html` into separate files (originally an `img/` folder; now referenced from the repo root, see the picture location fix)** (header logo, three years of team logos as WebP, 14 default headshots as JPEG; names carry a fingerprint, e.g. `logo.6751ba0b.webp`). `index.html` went from 1.33 MB to 270 KB; first load is about 0.5 to 0.6 MB compressed instead of 0.89 MB; reopening on weak signal went from 4.7 s (1.6 Mbps), 18.3 s (400 kbps) and 45.1 s (160 kbps) to about 0.1 s; with no signal 0.2 s. `SHELL` in `sw.js` lists every picture. **When a picture changes, give it a new fingerprint name, update its reference in `index.html` and the `SHELL` list, and raise `CACHE`.** `avatar()` falls back to the initials bubble (`avErr`) if a headshot file does not load; the header logo hides itself if its file is missing. Canvas recap cards use the picture files (same origin, so exporting works over http/https, not from `file://`). Test: `swtest3.js` (serves the folder over http with throttling, checks the offline install, every picture, reopen speeds, the update banner and recap export).
  - **Picture location fix (cache v31, Oct 2, 2026).** The owner uploaded the 21 picture files to the repo ROOT (no `img` folder), which made every picture 404 (logos disappeared; headshots still showed only because phones had them saved from an earlier version). The app now looks for pictures in the repo root first and, if one does not load, tries the other place once (`picAlt`, shared capture-phase `error` listener on the document, also run once for pictures that failed before the script started; recap cards do the same in `rcLoad`). A picture missing in both places is hidden quietly (headshots become the initials bubble). `SAFEIMG` accepts a plain picture file name or `img/` + name. `sw.js` lists the files without a folder and caches any same-origin `.webp`/`.jpg`/`.png` it fetches. Both layouts work: flat in the root (current) or inside `img/`. Test: `layout.js` (serves three layouts over http: root, `img/`, missing; checks the header logo, Scoreboard/Teams/Profile/Matches pictures, bounded retries, recap export).
  - **Readability.** axe-core accessibility audit: 5 rule violations before, 0 after (12 screens, light and dark). New colour variables: `--muted` `#566673` (was `#6b7a86`), `--teal` `#1d7280` (was `#2A8C9A`, so Team Guad's teal is slightly deeper everywhere, recap cards included), and text-safe `--redt`, `--tealt`, `--goldt` (lighter in dark mode) used for text and outlines (`.rs` buttons, links, results, the yardage line). Every unlabeled form control gets an `aria-label` and wide tables get keyboard access after each draw (`a11yPass()` in `render0`); the live screen has a hidden `h1`; the practice ribbon has `role="status"`. Test: `a11y.js`, `a11y2.js`, `a11y4.js`.
  - **Known and left:** each player's 18 scores are one record, so two phones typing different holes of the SAME player at the same moment can overwrite each other (normal play has one scorer per player); no Subresource Integrity on the Firebase scripts (cannot fetch the hashes from here); no content-security policy (inline handlers prevent a strict one); roles (admin, scorer, watcher) are still one shared code.
- **Live win chances, recap cards, close and archive (cache v29, BUILD 23, Sept 30, 2026):**
  - **Live win chances** (`winOdds()`, `winMatch`, `winBox()`; shown on the Scoreboard under the points). An estimate, not a promise. Points already won are locked in; every match still to play or in progress is simulated hole by hole from its current state (`hdist` convolution over the remaining holes of the front nine and back nine; decided segments are fixed; overall = front plus back), then match point distributions are convolved into the weekend total. Per hole: halve probability `WIN_PH` (best ball .30, singles .22) and a small edge from the sides' average power rating (`WIN_D`=30, `WIN_K`=.35: only 35 percent of a rating gap counts because strokes and balanced pairings absorb the rest); a side with no lineup uses its team's average rating. Result: Team A win, tie (exactly half of the points), Team B win, shown as a bar with "needs X more to win" and a "How this works" note; rounds to 100 (`winPct`), shows "<1%" / ">99%" until mathematically decided. Tests (`scen_odds.js`): within 0.19 points of an independent 300,000-trial simulation at 5 stages (before play, after Friday, mid-Saturday, after Saturday, mid-Sunday); more points banked always raises the chance; all matches final gives 100/0/0 or a tie.
  - **Recap cards** (`recapData`, `recapDraw`, `recapShare`, `recapPage`; `MS='rc'`): 1080x1350 PNG pictures drawn on a canvas, one per day once a match that day is submitted ("so far" until the day is done) plus a final card once all 13 are submitted. Day card: cumulative points and today's points per team, win chance, every match and result, day honors (Medalist, Alpha, Birdie Machine, Hot Start, ...) and pot winners from `awardsAll()`, next day's course and tee time. Final card: champion, final score, Sunshine, Gerry Bertier, Alan Bosley, day-by-day points, weekend bests (low gross, low net, most birdies) and the three biggest payouts. Reached from the Scoreboard ("Share recap cards") and, once closed, from Admin. Share uses the phone's share sheet with a picture file, falling back to a download. Fonts must be loaded before drawing (`document.fonts.load`). Tests: card data equals app data; text drawn is checked by recording `fillText`; layout checked by eye.
  - **Close and archive** (`closeCard()`, `closeEvent()`, `reopenEvent()`, `buildArchive()`, `archivePage()`, `pastEvents()`, `downloadArchive()`, `EVENT_YEAR`=2027). Admin → **Close the event** locks the event on every phone and saves a permanent snapshot (results by day and match, round gross and net, awards, payouts, final power rankings, rosters). It asks twice if matches are not submitted ("Close anyway (N not submitted)"). Both `S.closed` and `S.archive` travel in the shared **settings record** (`meta/settings`), so no Firebase rule change is needed. **While closed:** `isRO()` is true (so `kp`, lineups, tees, finalize/reopen match, pairings, course, reset, roster edit, backup restore all do nothing), match fields stop syncing (`pa()` uses `roBase()` and skips the match loop but still syncs settings so Reopen works), the live screen pill reads CLOSED, every page shows an "Event closed" notice, and the Admin page shows the closed card first with all other cards inside a disabled fieldset. **Reopen the event** (Admin, with a confirm) unlocks everything; the archive is kept until the next close rebuilds it. The archive is read under **More > History > Past events** (`MS='arc'`, `ARCY`), works from the saved archive alone (even if live scores were cleared), escapes every field, and can be downloaded as JSON. `S.archive` and `S.closed` are in the backup (`BK_KEYS`). Tests (`scen_close.js`, `scen_reopen.js`): closed on all 3 phones, every edit attempt changes nothing, archive equals the live data (totals, day points, 36 awards, 42 rounds, payouts), hostile names are escaped, reopen from another phone works, closing again rebuilds. **Not included:** rolling the app over to a new year (new courses, clearing scores, feeding the archived year into career history and rankings): history for past years is still the hard-coded tables, and 2027 stays the live year until that is built.
- **"Schenk" is Bill (cache v28, BUILD 22, Sept 30, 2026):** the owner asked for every "Schenk" to become "Bill" and the data to be linked correctly. **The name does not appear anywhere in the files in the project** (`index.html`, `sw.js`, `manifest.json`, the handoff and the report all searched, case-insensitive), so it can only be in the live data: a roster rename (Teams → Edit roster, or the roster in Admin) saved in the shared record `meta/main` and in phones' saved copies, or in a copy of `index.html` edited by hand in GitHub (uploading this file replaces that). **Why it matters:** a player's name is the key to his history. Scores 2024 to 2026 (`SC24/25/26`), match results (`RES`), rosters and titles (`TY/TW`), payouts (`PAYD/PAYH`), hometown (`HOMETOWNS`), awards and the power rating all look up the name "Bill". A roster that says "Schenk" disconnects all of it (tested on the previous build: 0 rounds, unrated, ranked last). Headshots are keyed by roster position (`ti_pi`), not name, so they were never affected. **Fix:** `fixNames()` (runs at startup, after every shared-record update, and after restoring a backup) now turns any roster name that is "Schenk" (any case or spacing) into "Bill" and replaces the word in the rules text, event name, awards, log and tees (`NAMEFIX`, `scrubNames`). Because every phone corrects it and the correction is then pushed, the shared record heals itself: tested with a roster record that said Schenk and two phones updating, the record and both phones say Bill, his history is back (9 rounds, 3 events, $12 in payouts, Pasadena, MD, ranked #12), and a restored old backup is corrected too. To rename a veteran on purpose later, change `NAMEFIX`/the history tables, not just the roster. **Admin → Player data check** (`rosterCheck()`) lists each player with the rounds and matches found for his name and flags anyone with no history (expected only for a first-time player such as Fogel), so a mismatched name is easy to spot. `BUILD` raised to 22 so a phone still on the old build cannot write the old name back before it updates. Test: `scen_schenk.js` in the test zip.
- **Split 3v3 live scoring (cache v27, build still 21):** the Friday and Saturday 3v3 best ball matches (match 3, `m.n==3`, not Sunday) are played as two threesomes, so each team goes out as its own group and is scored on its own phone. **Decided by the owner:** teams stay together (group 1 = Team Lutz's three at the first tee time, group 2 = Team Guad's three at the second; no per-player group setup; tee times come from `TEET` via `grpTimes`), and **a hole's individual scores are hidden until the hole is decided** (both groups have posted it). No data or sync changes: groups are derived from teams, scoring rules are unchanged (best net of three per side, same strokes and Nassau).
  - **Code:** `isSplit(m)`, `LVG` (group chosen per match for the session), `grpKeys`, `grpHoles` (holes a group has fully posted), `lvOrd` (the players this phone scores), `lvGrp(g)`, `lvGroupChips`, `lvSplitHole`, `lvKeypad`, `lvSplitProgress`, `lvVis`, `lvDoneAll`. `lvFirst`, `lvDone`, `lvAdv` use `lvOrd`, so selection and auto-advance stay inside the group (`kp` also refuses a player outside the group). Non-split matches are unchanged (the old code path is kept).
  - **Scorer phone:** opening the match asks "Which group are you scoring?" (two buttons with tee time, team and names, plus Just watch). After choosing it shows only that group's three rows and the keypad; the banner says "Waiting on you: ...", "Hole N posted, waiting on the 1:40 PM group (Team Guad)" or the hole result once decided. A line says whether the other group has posted that hole; their scores appear only after the hole is decided. The group chips in the navy block (tee time, team, hole, 18-segment progress bar; own group outlined and tagged YOU) are tappable to switch group. Auto-advance moves to the next hole when this group finishes it, without waiting for the other group.
  - **Match status:** unchanged: counted hole by hole once all six players have posted it ("thru N" = last decided hole). A hole posted by only some players shows as a dashed ring on the strip.
  - **Watching / view-only / watch link:** both groups listed; a hole's score boxes show only a check mark per player who has posted until the hole is decided. **Card tab:** scores of undecided holes show a bullet, not the number. **Status tab:** "Group progress" card; Submit final score unlocks when all six have 18 holes and either scorer can tap it.
  - **Not hidden (left as is):** the Leaderboard and the individual net totals still show running totals; the Awards, Payouts and power rankings only use completed rounds. Tell the owner if even running individual totals should be hidden during a round.
  - **Tests** (`scen_split.js` in the test zip, Friday and Saturday): split detection, chooser, own-group-only rows, auto-advance inside a group, different paces (one group 3 holes ahead), nothing from the other group visible on the scorer, watcher or Card views until decided, reveal on decision, final result vs the independent calculation, all scores intact on every phone, and the misuse guard.
- **Power rankings and player-data audit, unrated players (cache v26, build still 21):** the ranking engine and every figure on the player profile were rechecked against independent calculations. (1) Ratings and ranks: an independent re-derivation of SAM, handicap score, first-pass strength, opponent-adjusted match play and final RBPR matched `rbAll()` for all 14 players at six stages of a weekend (before, Friday submitted, Friday with one match unsubmitted, Saturday, Sunday): 0 differences. (2) Saved history (`SC24/25/26`, `RES`, `TY`, `TW`, `PAYD`, `PAYH`, `CRS`): totals, averages, team points, rosters, titles and itemised payouts are internally consistent; the only note is that Fogel is not in the career name list `HN` (correct: he has no history; left as is so he does not appear in all-time tables). (3) Profile figures (past scores, match records 2025 and 2026, career card, head to head, the four "Why this rating" bars adding up to the rating): 0 discrepancies for 14 players before the weekend and the rating bars after it. Real-world values (handicap indexes, historical scores) cannot be verified from inside the app. **Fogel / no-data players:** the engine already ranks a player with no SAM history, no 2027 rounds and no matches last (`noData`), but his handicap-only estimate (50.9) was shown and looked higher than four players above him. Now: the Power Rankings list shows an en dash and "No data yet" for such a player, his detail page shows "Unrated" with a "Why unrated" card, the Team Power averages leave unrated players out (with a note), the pairing tool labels his number "est." and still uses the handicap-only estimate, and a "Built from: 2025 and 2026 history, N completed 2027 round days and M submitted 2027 matches" line (plus who is unrated) sits under the list so test scores in the live event are easy to spot. A player stops being unrated as soon as he has a completed 2027 round or a submitted match. Tests: `scen_rbpr.js`, `scen_player_audit.js` in the test zip.
- **Awards on the player profile (cache v25, build still 21):** a new **Awards** card sits between Past scores and Payouts on every player profile (`awardsCard(n,ti)` called from `profilePage`; data from `awardsAll()`; badges drawn as inline SVG by `awEmblem`, section crest by `awCrest`, award list `AWD`; styles `.awt .awg .awn .ayc .awd .awr .awl`). 16 awards, 4 groups: **Event** (Sunshine, Gerry Bertier, Alan Bosley: medals), **Round** (Medalist = lowest gross, The Alpha = lowest net, The Beta, Birdie Machine, Mr. Consistent, Hot Start, The Closer, Hacker: shields), **Money pots** (Front 9, Back 9, Overall, Best Ball: coins), **Team** (Ryder Cup champion: star). A win shows the year; several wins show a x N badge and year chips (short form '24 '25 '26 when 3+ years); tapping a badge opens a detail panel with every win (year, day, score or amount). Unearned awards appear as dim badges under "Still to earn".
  - **Past years** come from saved data only: round awards (Medalist, Alpha, Beta) 2024 to 2026 from `SC24/SC25/SC26` round totals (ties share); Ryder Cup, Sunshine, Gerry Bertier and Alan Bosley for 2025 and 2026 from `RES` points and `TY` rosters (winner from `RES[y].f`); money pots from `PAYD` (only 2026 is itemised). Hole-by-hole awards (Birdie Machine, Mr. Consistent, Hot Start, The Closer, Hacker) exist for 2027 onward only.
  - **2027 counts submitted matches only.** A match is used once `mFin(m)` is true (all three results and Submit final score), so awards appear and change as matches are submitted, on every phone (the `final` flag syncs). Round awards and pots use players with a complete 18-hole round in a submitted match; best ball uses submitted sides; event awards and the Ryder Cup use points from submitted matches only (Alan Bosley and Gerry Bertier consider only players who have a submitted match).
  - **Live vs final:** an award whose scope is not finished is marked **live** ("Leading" chip, gold dot on the year, counted in "N live"): round awards and pots until every match that day is submitted (`dayDone`), event awards and the Ryder Cup until all 13 are submitted. Ties share an award; an exact Ryder Cup tie shares it between both teams once everything is submitted.
  - **Tests** (`scen_awards.js`, `scen_awards_sync.js` in the test zip): an independent calculation matched the app at every step as 13 matches were submitted one at a time (0 differences); nothing shows while matches are scored but not submitted; 6 phones (one on the watch link) agree after each submit; reopening a match takes its awards away. Redrawing a profile takes about 29 ms on a phone-speed CPU.
- **Tee times (cache v24, build still 21):** `TEET` now holds per-match tee times for Friday (1:10 PM, 1:20 PM, 1:30 PM & 1:40 PM) and Saturday (10:10 AM, 10:20 AM, 10:30 AM & 10:40 AM); shown under each match title on the Matches tab (match 3 is a 3v3 played as two threesomes, so two times). Sunday has seven 1v1 matches, so its times are not per match: `TEETD.Sunday` = 8:30, 8:40, 8:50 and 9:00 AM, shown once as "Tee times ..." under the Sunday heading, read as the four playing groups (2 foursomes + 2 threesomes). Friday is assumed PM and Sunday AM. Edit `TEET`/`TEETD` in `index.html` to change them; they are not editable in Admin and not synced.
- **Pairing page fixes (cache v23, build still 21):** found by a test that checks Saturday and Sunday pairings use rankings updated by the previous day (they do, once the day's matches are submitted: Saturday page ratings equalled the post-Friday ratings for 112 of 112 players in 8 simulated weekends, and the Saturday lineup differed from the pre-Friday-rating lineup in 8 of 8). Two bugs were fixed in `rbPairPage`/`render0`: (1) the day chosen with the Friday/Saturday/Sunday buttons is forgotten when the page is left (`PAIRDAY=null` alongside `PAIRC=null`), so the page opens on the current day again; (2) the cached suggestion carries a signature of the ratings it was built from (`PAIRC.sig`) and is rebuilt when any rating changes (e.g. late score corrections while the page is open); applying lineups does not change ratings, so "the suggestion stays fixed while you apply it" still holds (6 of 6 weekends, 14 of 14 placed, no duplicates). Known and left alone: a Friday match that was not submitted keeps Friday as the current day and leaves that match's result out of the ratings; the day buttons still reach Saturday. No submit warning was added (owner's choice).
- **Header title is fixed (cache v22, build still 21):** the event name in the header is no longer a button. The gold chevron is gone and tapping the title no longer opens a rename box (`<div id="hd">`, `rename()` removed). The event name is treated as permanent. It can still be edited in Admin → Event (that card was left in place); say so if it should go too. `BUILD` was deliberately not raised for this cosmetic change so phones are not held back from saving; raise `BUILD` only for changes that affect scoring, sync or shared data, and raise `CACHE` in `sw.js` on every release.
- **Practice tournament, build 21 (Sept 30, 2026):** Admin → **Practice tournament** lets anyone run a full practice Ryder Cup that cannot touch the real event.
  - **Mode flag:** `PRACTICE` (defined before `KEY`) is true when the URL has `?practice=1` (also `=on`/`=true`/bare `?practice`) or `localStorage.rbc_practice_on=='1'` (sticky). `?practice=0` / `?practice=off` / `?scorer=1` turn it off. Practice wins over the watch flag (`VIEWER` is false in practice).
  - **Isolation:** `KEY` is `rbc_practice_v1` instead of `rbc_v2`, so the real saved copy is never read-modify-written; `initDb()` returns immediately (status `practice`, no Firebase init, no sign-in, no listeners, `DB` stays null); `fl()` and `pa()` also return at once. Nothing is sent or received, and the Access code, Shared settings, Share a watch link, Backup and This phone cards are removed from Admin (`stripCard`). Photo album shows "turned off in practice".
  - **Start / seed:** `startPractice()` (confirm, then reload with `?practice=1`). A new practice state is `mk()` plus a copy of the real event's `event, teams, rules, allow, pay, payv2, payv3, rbpr, crs` taken from `rbc_v2` on that phone; no lineups or scores. Admin shows a shareable practice link (`practiceLink()`, Share / Copy).
  - **Auto-play:** `prPlayDay(day)` / `prPlayAll()` choose the Sunday course if missing, apply the optimizer (`rbApplyAll`) when a day's lineups are empty and no scores exist, fill every missing score with random handicap-based scores (`prFill`, keeps scores already typed), then submit each match (`final`). Rankings and the next day's pairings update as in a real weekend. `prRestart()` clears `rbc_practice_v1` and restarts.
  - **UI:** a gold sticky ribbon "Practice · nothing is saved to the event" with an Exit button (`#prb`, header offset 26px in `body.practice`), header status "Practice", live-screen pill "PRACTICE". `exitPractice()` reloads with `?practice=0`; the practice copy stays on the phone until "Start over".
  - **Not shared:** each phone has its own practice tournament; there is no shared practice event.
  - **Safety note:** phones still on a build before 21 ignore `?practice=1` and would open the real event, so `BUILD` is now 21 (cache `rbc-shell-v21`): older phones are held back and must update before the practice link is shared.
- **Multi-user fixes, build 20 (Sept 30, 2026; items 2, 3 and 8 of the 14-phone test plan):**
  - **Shared settings (2):** the Sunday course (`S.crs`), payout amounts (`S.pay`) and Power Ranking settings (`S.rbpr`) now live in a second shared record, `meta/settings` (`{j, v, code}`, sync key `settings.settings`, built by `jm('settings')`, applied in `apField`, listener `subSet` in `initDb`, handled in `pa`, `fl`, `revert`). Roster, names, handicap indexes, rules text and the allowance stay in `meta/main`. Nothing is written until someone changes a setting after opening the app (`LSET` baseline, same idea as `DEFMETA`): phones that open with different local values do not overwrite each other. Admin → **Shared settings** → "Use this phone's settings for everyone" (`shareSettings()`) pushes one phone's values the first time. The scoring log (`S.log`) is still local to each phone.
  - **Sunday course (2):** `setCourse(v)` (used by the Matches picker and by the live screen) re-derives Sunday results. With no course chosen, `kp()` refuses to save a score and the live screen shows "Pick the Sunday course to start scoring" with a picker (hidden for view-only phones) instead of the keypad.
  - **The database is the judge for conflicts (3):** `apField` no longer rejects updates by version number. It ignores a remote value only while this phone has its own change waiting or in flight for that exact field (`pend`); if the change was in flight, the latest remote value is kept in `HELD[key]` and applied right after our write finishes (so after two phones write the same score, every phone ends on the value that reached the database last). Identical values are skipped (`LP[key]===val`). `nextV`/`_v` stamps are still written but no longer used to decide anything. Offline edits that reconnect later still win if they reach the database last (consistent on every phone, not necessarily the newest edit).
  - **Optimizer (8):** Optimize Pairings has a day picker (default `curDay()`), **Apply all N matches** (`rbApplyAll(day)`), **Recalculate**, a suggestion that stays fixed while you apply it (`PAIRC`, cleared when you leave the page), and refuses to change any match that already has scores or was submitted (`rbGuard`, message in `PAIRMSG`). The "already played together" count now ignores the day being optimised (`rbWeekendPairs(skipDay)`, `rbFamiliarity(day)`), so applying a suggestion no longer changes the next one. View-only phones cannot apply.
  - `BUILD` is 20 (cache `rbc-shell-v20`): phones on build 19 are told to update.
- **Small multi-user fixes, build 19 (Sept 30, 2026; from the 14-phone test, see `MULTIUSER_TEST_REPORT_AND_FIX_PLAN.md`):**
  - **App build check (item 1):** `const BUILD` in `index.html` (25 now). **Raise `CACHE` in `sw.js` on every release (and keep its `SHELL` picture list in step with the `img` folder); raise `BUILD` only when scoring, sync or shared-data behavior changes** (phones on an older build are held back from saving until they reload). The highest build seen is stored in `meta/main.build` (written by any phone with the edit code when its BUILD is higher; phones opening together take turns). A phone with a lower build sets `STALE=true`: it shows an "Update available" card (`noticeHtml()`), live-screen pill "UPDATE", cannot save (`isRO()` is true, edit entry points return), and `appUpdate()` clears the caches and reloads. Phones on builds older than 19 do not have this check, so everyone must reload once after this release.
  - **Old local data (item 4):** `LBASE` holds what every sync field contained when the phone opened. If the database has nothing for a field and the phone's copy is still exactly that, the first server snapshot clears it (`clearStale`) and `pa()` never pushes it. Real edits (value differs, or listed in `DRT`) still sync. Admin → **Clear this phone's saved data** (`freshStart`) wipes the saved state (keeps access code, theme, headshots).
  - **Unsent edits survive (item 6):** `DRT` (saved in `localStorage.rbc_dirty`) lists fields edited but not yet confirmed; `apField` won't overwrite them (`pend()`), `pa()` pushes them even after a restart, `fl` clears them on success. Score fields now sync after 250 ms (was 900). `flushNow()` pushes everything pending when the page is hidden or closed (`visibilitychange`, `pagehide` listeners in the page tail).
  - **Typing protection (item 7):** `rr()` holds a redraw while an input, textarea or select has focus (`RRDEF`); a shared-settings update that arrives meanwhile is kept (`PENDM`) and applied, followed by the redraw, when the box loses focus (`focusout` listener).
  - **Wrong access code (item 9):** a rejected write now takes that change back off the screen (`revert`), sets `DENIED`, and shows a "Not saved / Enter access code" card until the code changes or a write succeeds.
  - **Cold start (item 10):** the untouched starting roster/settings (`DEFMETA`, only captured on a phone's very first run) is no longer written to the database; 14 phones opening on an empty database now make 3 tiny writes instead of about 10.
  - Screen info (Admin) shows the App build.
- **Sync bug fixed (found while testing the allowance setting):** `pa()` scheduled the shared roster/settings record (`meta/main`: event name, teams incl. **handicap indexes**, rules text, `allow`) under timer key `TM.meta` but `fl()` clears `TM['meta.meta']`, so after the first push no later edit to those ever synced from that phone. Now both use `TM['meta.meta']`. Verified with two simulated phones: rename, handicap index, event name, rules and allowance edits all reach the other phone; the old build did not.
- **Batch added Sept 30, 2026 (owner items 2, 4, 7, 9, 10, 12, 13):**
  - **Hole-tab submit (2):** when all 18 holes are in and the match isn't final, a teal "Match complete" banner with **Submit final score** shows above the rows on the Hole tab (hidden for view-only phones); once final it shows "Match finalized" with a Details button.
  - **Yardage (7):** hole header shows the hole's yardage for each distinct tee in the match (one tee: "302 YDS · BLUE"; mixed: "WHITE 289 · BLUE 302").
  - **Swipe (10):** swipe left/right (>=70px, mostly horizontal) on the Hole tab changes hole (`swipeInit`, listeners on `#main`; ignores the keypad and top buttons).
  - **Backup (4):** Admin → Backup: Download (share sheet on phones, file download otherwise; `backupData()` JSON of event, teams, matches, sc, tees, crs, rules, pay, awards, rbpr, allow, log; no photos), Restore (validates the file, confirm + type RESTORE; keeps a copy of the current data in `localStorage.rbc_prerestore`), Undo last restore (`bkApply`, `bkCheck`).
  - **Watch link (9):** `?watch=1` (or `#watch`) makes a phone a **viewer** (`VIEWER`, `isRO()`): no access-code prompt, no writes (`pa`, `kp`, `lvClr`, `lvFollow` all check `isRO()`), larger text (`body.watch main{zoom:1.12}`), edit controls hidden by CSS and guarded in code (`lineup`, `tg`, `rbApplyPair`, `finalizeMatch`, `unfinalize`, `setTee`, `setTeeA`), no Admin; More has **Scorer sign-in** (`scorerSignIn()` → `?scorer=1`, clears the sticky flag `localStorage.rbc_watch`). Opens on the Scoreboard; live matches use follow mode. Admin → **Share a watch link** card (Share / Copy). `sw.js` offline fallback uses `ignoreSearch`.
  - **Handicap allowance (12):** `S.allow={bb:90,mp:100}` (synced inside `meta/main` as `allow`). `alw(m)` = percent for the match (`m.n>1` best ball, else singles); `stk(m)` takes each player's Course Handicap × allowance (round half up, integer math) then subtracts the lowest. Individual net (`roundNet`: leaderboard, Front/Back payouts, round awards, Best Ball payout) still uses the full Course Handicap. Admin → Handicap allowance selects (`setAllow` re-derives results); Rules page has a Handicaps card; Tees card mentions the percentage. USGA recommends 90% for four-ball. Oracle tests updated (`matchStrokes(players, allow)`).
  - **Photo storage (13):** `addPhotos` uploads to Firebase Storage (1600px + 360px thumbnail kept in the Firestore record `{year,url,path,thumb,ts,by}`) and falls back to the old inline `img` record if Storage is unavailable (`PST` flag). Album grid shows `thumb||img`, full view `url||img`; delete also removes the stored file. `firebase-storage-compat.js` script added. Files `storage.rules` and `STORAGE_SETUP.md` (Storage needs the Blaze plan; optional). **Tested only against a simulated Storage service.**
- **iPhone Safari cut-off fix (Sept 30, 2026):** owner screenshots on iOS 26 Safari showed a flat strip about 92px tall at the bottom (and one under the top bar) where page content, the fixed bottom menu and the lower part of the sticky keypad were hidden. The static viewport meta no longer has `viewport-fit=cover`; a small script in `<head>` adds it back only for the Home Screen app (`navigator.standalone` or `display-mode: standalone`), so browser tabs keep their content inside Safari's bars. The scroll-settle nudge now also runs while live scoring (it toggles `body` min-height by 1px for one frame, since the menu is hidden then). Admin has a **Screen info** card (`scrInfo()`: screen/window/layout/visual-viewport sizes, safe-area insets, Home Screen yes/no, viewport setting) so a screenshot shows what the phone reports if the problem returns. **Not verified on a real iPhone** (could not reproduce iOS Safari in the test environment).
- **Thinner bottom menu that hides on scroll:** `nav` is shorter (2px gold line, 34px buttons, less dead space under the labels on iPhones: bottom padding `max(3px, safe-area - 14px)`; 85px -> 56px with a home indicator, 51px -> 39px without) and `body` padding-bottom is 56px (was 84px). A small scroll script near the end of `<script>` adds class `hid` (`translateY(100%)`, 0.22s transition, none with reduced motion) after scrolling down ~14px past the first 60px; it comes back on any ~6px scroll up, near the top (<=60px), near the bottom (within 40px) and on orientation change. Rubber-band overscroll is ignored. The nav is also hidden entirely while live scoring (`body.live`). The earlier iOS blank-bar tweaks (translateZ layer, scroll-settle nudge) are still in place.
- **New live scoring screen** (hole-by-hole, docked keypad, live team scores, Card/Status tabs, follower mode; nav + app header hidden while scoring). See §6.1. Tested: 13/13 matches vs oracle through the keypad path, 25-phone sync, chaos (outage/clock skew/dead listeners), fuzz on all tabs and follow mode, 3v3 layout, dark mode, view-only, no-course warning.
- **Tabs changed:** Leaderboard replaced History in the bottom bar; History moved into More (second item, after Power rankings).
- **More menu reordered** (Admin last); **Change access code moved into Admin**; **Rules page has an "Individual awards" section** (event awards Sunshine / Gerry Bertier / Alan Bosley, and round awards The Alpha, The Beta, Birdie Machine, Mr. Consistent, Hot Start, The Closer, Hacker). The awards text is static code in `rules()`, not part of the editable `S.rules`; if an award's logic changes, update it there.
- **Award rename migration:** `fixNames()` (called at startup and after remote `meta` loads, next to `fixRoster()`) rewrites "Big Dog" / "Just Go Home" in the saved rules text to "The Alpha" / "The Beta" on the phone and in the shared database. Keep it in place.
- **Saturday tee times** on Matches cards (`TEET` constant: 10:10, 10:20, 10:30 & 10:40 AM).
- **Payouts overhaul:** 2027 amounts ($21/$21/$28/$70 Best Ball each; $340 Ryder Cup each; no Sunday), amounts shown next to each label, ties split, corrected **Best Ball** rule (lowest net best-ball pairing of the day from any match), renamed overall pot to **"Ryder Cup Champion"**, **Total payouts per player** table, buy-ins removed from display.
- **Scoreboard** now shows only the current day's "Points in play" (auto-detected); Upcoming/Finished sections removed.
- **Stat/side-game awards** added to Scoreboard and per-day finals.
- **Player headshots** on rosters/cards, **Leaderboard** (All / per day), **Payouts** page, **Power Rankings (RBPR)** with settings + **pairing optimizer**, **player profiles** with rivalries/history/payouts.
- **Photo album** by year (More → Photo album).
- **PWA** install page, manifest, icons; **light/dark theme**.
- New **2027 team logos** (circular/shield coastal badges) replacing older ones (older logos kept for 2025/2026 views).
- WHS **Course Handicap** auto-calc, per-player tees, Bear Trap Sunday combos, one-match-per-day hard block, no pickup button, max double par + 2, reference-style stacked scorecard.

**Notes vs code naming differences (confirm with owner before "fixing"):**
- ~~Notes say side award "Alpha"; code shows "Big Dog".~~ Resolved: the award is now **The Alpha**, and "Just Go Home" is now **The Beta**.
- Notes say "**Strong Finish**"; code shows **"The Closer"**.
- Notes say 2025/2026 awards "MVP / LVP / Wanna Bee"; the app uses **Sunshine / Gerry Bertier / Alan Bosley** everywhere (owner later asked for these names).
- Notes say History uses the "Individ Records" sheet; code **computes** records from `RES` + 2027 matches.
- ~~Notes say scores sync via "Firebase"; code uses `claude.use('db')`.~~ Now consistent: the code uses Firebase Firestore.

---

## 15. Unfinished / pending
1. **Photo storage:** code is in (see Recently added) but Firebase Storage still has to be turned on in the console (Blaze plan, `storage.rules`); until then photos use the old inline method. See `STORAGE_SETUP.md`.
2. **Live sync needs a real-world test:** Firestore sync is built but the README says it was only tested with a mock. Confirm on two real phones: Firestore created, Anonymous auth on, `firestore.rules` published, `config/access` doc exists.
3. **Sunday course** not yet assigned (3 Bear Trap combos selectable). It is now shared by every phone (build 20) and scoring is blocked until it is chosen.
4. **Historical payouts:** 2024 empty; 2025 totals only; 2026 itemized. Owner may send more.
5. **2027 event** hasn't been played; all 2027 lineups/scores empty.
6. Rules text (`DR`) only mentions Sunshine / Gerry Bertier / Alan Bosley; side-game awards, payouts and finalization aren't described in Rules. (Not verified against current `DR`.)
7. **Stale wording:** the Photo album message when offline/local still says photos "need the Live Sync link". Ask before changing.

---

## 16. Known bugs & limitations
1. ~~Malformed `<head>`~~ **Fixed.** `<head>` is well-formed; manifest link is `manifest.json`, apple-touch-icon is `icon-192.png`. `manifest.json` and the icons are not in project knowledge; verify they are in the repo (DevTools → Application → Manifest).
2. ~~Service worker never registered~~ **Fixed.** Remember to bump `CACHE` in `sw.js` each release.
3. **Sync needs Firebase to be reachable.** If the SDK is blocked or offline at load, status is "Local" and the Photo album shows its "Live Sync link" message.
4. **Old data doesn't carry over.** Scores, player photos and album from the old claude.ai artifact are not in the Firebase project; Firestore starts empty until entered.
5. **Not synced per phone:** Sunday course, payout amounts, RBPR settings, scoring log, manual awards.
6. **Conflicts:** different players' scores never collide (per-field sync). The same player's same field edited at once: the higher version wins on every phone (phone clocks no longer matter). `struct` (lineup + results) is one field, so two people editing lineups at once can overwrite each other.
7. **Access is one shared code.** Anyone with the code can edit rosters, scores, Admin, or **Reset all scores** (two-tap confirm only). Anyone without it can read. Photos are writable by any signed-in device. "Enter admin mode" on the Scoreboard is still just a navigation link. The prompt for the code appears on first load.
8. Player identity is **index-based** (`ti_pi`); editing names is safe, removing/reordering players reindexes scores/lineups/photos (`rm()` handles it) but historical data matches by **name**, so renaming a player breaks their history link.
9. `S.awards` / `TT` (CTP, Long Drive, Birdie Bro, My Chippy) are legacy leftovers; `award()`/`setA()`/`man()` remain in code but aren't reachable from Scoreboard.
10. Very large file (~1.2 MB, mostly base64 images): hard to diff; editing tools may time out. Keep images embedded unless the owner approves moving them to files.
11. Photo album query limited to 60 photos per year (`limit(60)`).
12. `render()` saves + schedules sync on every render (including navigation). Harmless but chatty.
13. A match's results aren't counted as finished until someone taps **Submit final score**.

---

## 17. Design / UI rules that must NOT change (without asking)
- **Colors:** `--navy #0B3350`, `--gold #F2B62B`, `--red #B03227` (Team Lutz), `--teal #2A8C9A` (Team Guad). Light theme tan: `--bg #F5E8D3`, `--card #FBF4E6`, `--line #d3c4a8`, `--muted #6b7a86`. Dark: `--bg #07202f`, `--card #0d3048`, ink `#F5E8D3`, `--line #245069`. Header always navy with gold bottom border; tie/halved = red/teal diagonal split.
- **Fonts:** Barlow Condensed 800 uppercase for headings/labels/numbers; Barlow for body.
- **Theme:** Appearance options "Match my device" / Light / Dark. Dark keeps the navy look; Light uses tan/sand.
- **Bottom tabs:** Teams, Leaderboard, Scoreboard, Matches, More (this exact order; owner changed it Sept 30, 2026). History, Rules & Admin live in More. On phones under 420px wide the tab labels use slightly tighter letter-spacing so "Leaderboard" and "Scoreboard" don't touch. The bar auto-hides while scrolling down and returns on scroll up.
- **Scoreboard:** no Nassau boxes/labels, no Upcoming/Finished sections, only current-day points in play; awards Sunshine / Gerry Bertier / Alan Bosley + side games only (no CTP/Long Drive/Birdie Bro/My Chippy).
- **Live scoring:** hole-by-hole screen (strip, player rows, docked keypad, live team scores, Card and Status tabs, follower mode); see §6.1. **No pickup/X button**; max score **double par + 2**.
- **Handicaps:** WHS formula; lowest CH in match plays scratch; strokes on hardest holes first.
- **One match per player per day** (hard block).
- **Payouts:** only winnings, never buy-ins; ties split; amounts shown beside labels.
- Team logos: 2027 badges for current views; historical views use their year's logos.
- Match cards: "FRIDAY · MATCH 1 … SCORE ›", badge like "2UP"/"TIED"/"3–1".

---

## 18. Owner's GitHub workflow (manual)
The Claude Project is **not** connected to GitHub. The owner updates the repo by hand:
1. Ask Claude for the change; Claude returns the **complete updated `index.html`** (and any other changed file, e.g. `sw.js`, `manifest.json`, `firestore.rules`, `README.md`).
2. Download/copy the full file contents.
3. In the GitHub repo, open the file (e.g. `index.html`) → edit/replace entire contents (or upload the file) → commit to the main branch.
4. Repeat for any other changed files (icons, `manifest.json`, `sw.js`).
5. The hosted site updates after GitHub publishes (if using GitHub Pages this can take a minute; hard-refresh or reinstall on phones if cached).
6. Also re-upload the new `index.html` to the Claude Project knowledge so the next conversation edits the latest version.

**Repository details:**
- Repo URL: https://github.com/alutz108/Ronnie-Bass-Golf-Classic
- Branch: `main`
- Hosting (GitHub Pages): https://alutz108.github.io/Ronnie-Bass-Golf-Classic/
- Legacy claude.ai artifact link (old personal account, no longer needed for sync): https://claude.ai/artifact/NTBMMLcF7wToeRihRiV7EA — its old database does not transfer to Firebase.

**For Claude:** Always state which files changed. Since `sw.js` is registered, remind the owner to bump `CACHE` in `sw.js` each release (that makes `sw.js` a changed file every time). Never assume the repo has changes that aren't in project knowledge.

---

## 19. Anything else the next Claude needs
- **Start every task** by finding the relevant function by name in `index.html` and changing only that. Don't regenerate the file from memory — it contains ~1 MB of base64 you cannot reproduce.
- **Test checklist after edits:**
  1. App loads with existing `rbc_v2` data (no console errors).
  2. All 5 tabs (Teams, Leaderboard, Scoreboard, Matches, More) and all 8 More items render; History opens from More with a back button; Admin shows the Access code card.
  3. Pick lineups for a Friday match; enter scores; auto-advance works; hole-won/status/Nassau update; Scoreboard points and projected update.
  4. One-per-day block still enforced.
  5. Leaderboard, side awards, payouts compute.
  6. Light/dark both readable.
  7. Past years (2026/2025/2024) still render.
  8. Sync badge shows Live with the right access code and View only with a wrong one; a score entered on one phone appears on another.
  9. Submit final score / Edit this match anyway work and change Points in play.
- **Open decision to raise with the owner:** whether to sync Sunday course / payout amounts, and when to move photos to Firebase Storage. Don't implement either without confirmation.
- The trip data (rosters, handicaps, 2024–2026 results, courses) is authoritative in the file; don't "correct" historical numbers without the owner. Note: 2026 final is shown as **16–20** (Guad); owner once said 13–11, but the match results add up to 16–20 and the app uses that.
