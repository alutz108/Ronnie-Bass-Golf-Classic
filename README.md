# Ronnie Bass Classic — Multi-user live scoring setup

This app now supports real multi-user live scoring: several golfers can enter scores
from their own phones at the same time, and everyone watching sees standings update
automatically. This README is the exact setup required — there is no code left to write,
only a Firebase project to create and three values to paste in.

## What changed, in plain terms

- **Real-time sync** now uses Firebase Firestore instead of the claude.ai-only database
  the app used while it lived as a Claude artifact. Firestore is free at this scale and
  works from any host, including a plain GitHub Pages site.
- **Conflict protection**: previously the whole match (every player's scores) was saved
  as one blob, so two golfers editing different players' scores around the same moment
  could overwrite each other. Now each player's scores sync as their own field, so two
  people editing different players never collide. If two people somehow edit the exact
  same player's same hole at the same moment, the later write wins and both devices end
  up showing the same (correct, non-corrupted) result — tested directly, see below.
- **Offline handling**: Firestore's offline cache is turned on, so a phone that loses
  signal keeps working locally and re-syncs automatically once it reconnects. The status
  badge in the top-right of the app now shows Live / Offline / Connecting / View only.
- **Write access**: a simple event access code, checked on Firebase's servers (not just
  in the app), so a stranger who stumbles on the link can't edit scores.
- **Everything else is unchanged.** Scoring math, handicaps, Nassau points, standings,
  Power Rankings — none of that code was touched. It was all covered by the app's own
  existing automated test suite, which still passes in full.

## Step 1 — Create a Firebase project (free)

1. Go to https://console.firebase.google.com and sign in with any Google account.
2. Click **Add project**, give it a name (e.g. `ronnie-bass-classic`), and finish the
   setup wizard (you can skip Google Analytics).

## Step 2 — Turn on Firestore

1. In the left sidebar, click **Build → Firestore Database**.
2. Click **Create database**. Choose **Start in production mode**. Pick any region.

## Step 3 — Turn on Anonymous Authentication

Every device signs in anonymously (no login screen for golfers) so the security rules
below have someone to check. This is standard and free.

1. Left sidebar → **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Anonymous**.

## Step 4 — Publish the security rules

1. Firestore Database → **Rules** tab.
2. Replace the contents with the `firestore.rules` file included in this package.
3. Click **Publish**.

## Step 5 — Set your event's access code

1. Firestore Database → **Data** tab → **Start collection**.
2. Collection ID: `config`. Document ID: `access`.
3. Add one field: `code` (string) — set it to whatever password you want players to enter,
   e.g. `ronnie2027`.
4. Save.

This is the only "password" in the system. Anyone who has it can enter scores; anyone
without it can still view the app (read-only) but can't write. Change this value anytime
from the console if it ever needs to change — no app update required.

## Step 6 — Get your web app config

1. Project settings (gear icon, top left) → scroll to **Your apps** → click the **</>**
   (web) icon → register an app (any nickname).
2. Firebase shows a `firebaseConfig` object with six values: `apiKey`, `authDomain`,
   `projectId`, `storageBucket`, `messagingSenderId`, `appId`.

## Step 7 — Paste the config into the app

Open `index.html` (the file in this package) and find this block near the top of the
`<script>` section:

```js
const FIREBASE_CONFIG={apiKey:"__FIREBASE_API_KEY__",authDomain:"__FIREBASE_AUTH_DOMAIN__",projectId:"__FIREBASE_PROJECT_ID__",storageBucket:"__FIREBASE_STORAGE_BUCKET__",messagingSenderId:"__FIREBASE_SENDER_ID__",appId:"__FIREBASE_APP_ID__"};
```

Replace each `"__..._​__"` placeholder with the matching real value from Step 6. Save the file.

These values are not secret — they identify which Firebase project to talk to, not a
password. It's normal and expected for them to be visible in the page source. The actual
access control is the security rules (Step 4) and the event code (Step 5).

## Step 8 — Upload to GitHub

1. In your repo, add `index.html` and `firestore.rules` (keep `firestore.rules` for your
   own reference / to re-paste if you ever need to; the live app only needs `index.html`).
2. If you want a public URL, turn on **GitHub Pages** for the repo (Settings → Pages →
   deploy from the branch/folder containing `index.html`).

## Step 9 — Try it

Open the page, and the first time any device tries to save a score it will prompt for
the access code once (from Step 5) and remember it on that device from then on. Open the
same page on a second phone and confirm a score entered on one appears on the other.

## What you do NOT need

- No server to run or maintain — Firestore is fully managed.
- No Cloud Functions.
- No paid tier at this scale (a weekend golf event is far inside Firebase's free quota).

## What I could not test directly

I built and ran this in a sandboxed environment with no network access, so I could not
run it against a real Firebase project end-to-end. What I *did* verify, in detail:

- A full simulated multi-device test: two independent app instances sharing one in-memory
  mock of the exact Firestore API this code calls, with two "phones" editing different
  players' scores at the same moment — both edits survived on both devices.
- The same test for two phones editing the *same* player's *same* hole moments apart —
  both devices converge on the later write, with no data loss or corruption.
- A pending local edit is never overwritten by an incoming update for that same field
  while it's mid-flight to the server.
- The entire pre-existing scoring/handicap/Nassau test suite (36 checks) still passes.

Firestore's actual client SDK matches this mocked API exactly (`.collection().doc().set()`,
`.onSnapshot()`, `merge: true`), so this should carry over directly, but the one thing
worth actually trying yourself is Step 9 above — two real phones, one real link.
