# Locking down the database (build 24)

What this fixes: before, the event access code could be read by anyone who found the site (it was readable in the database and also saved inside every score record), and any signed-in phone could plant a hostile photo record. Now the code is checked once, never saved in the shared records, cannot be read back, and every write is limited to the fields the app really uses.

Do the steps in this order. Total time: about 15 minutes. Do it before the weekend, not during.

## Before you start
1. On the phone you trust, open More > Admin and tap **Download backup**.
2. Make sure the Firebase console is open in a browser (https://console.firebase.google.com, your project).

## Step 1: put the new app online
Upload these to the GitHub repo (the same folder as before):
- `index.html`, `sw.js`, `manifest.json`
- the 21 **picture files** (`logo...webp`, `team25-...webp`, `team26-...webp`, `team27-...webp`, `p-<name>....jpg`). Put them in the same place as `index.html` (the repo root). An `img` folder also works. The app no longer carries its pictures inside `index.html`, which is why it opens faster. The file names must match exactly, including the 8-letter code in the middle.

Wait a minute for GitHub Pages to publish. Every phone then reloads once and is asked to update (build 24).

At this point everything keeps working exactly as before. The app notices the old rules are still in place and falls back to the old way. More > Admin > **Database security** says **Old mode**.

## Step 2: publish the new rules
1. Firebase console > Firestore Database > **Rules**.
2. Replace everything with the contents of `firestore.rules` and click **Publish**.

## Step 3: set a NEW access code
The old code was readable by anyone, so assume it is known.
1. Firestore Database > **Data** > collection `config` > document `access`.
2. Edit the field `code` and type a new code. Save.

## Step 4: every phone enters the new code
On each phone: More > Admin > **Change access code**, enter the new code. (A phone that still has the old code shows a "Not saved" card with an "Enter access code" button.) Admin > Database security should now say **Locked down**.

## Step 5 (only if you use Firebase Storage for photos)
1. Firebase console > Storage > **Rules**, paste `storage.rules`, Publish. If the console offers to add permissions so Storage can read Firestore, accept.
2. Add one photo from a phone to check it still uploads.

## Check that it worked (Rules Playground)
In Firestore > Rules, open the **Rules Playground** and run these three simulated requests with the "Authenticated" switch on and any uid:
1. Get `config/access`: must be **Denied**.
2. Update `match/m0` (field `sc_0_0` = `[4]`) with a uid that has no `writers` record: must be **Denied**.
3. Get `match/m0`: **Allowed**.
In the app, a phone with the wrong code should show "Not saved", and a phone with the right code should score normally.

## Changing the code later
Edit `config/access` in the console. Every phone is switched off until its owner enters the new code (this is the point: it also removes phones that should no longer have access).

## What this does not do
- It is still one shared code: anyone who has it can edit everything (lineups, rosters, payouts, reset). Separate admin and scorer levels are the next step.
- Records written by the old app still contain the old code until that record is written again by the new app. That is harmless once you change the code in Step 3.
- I could not run these rules against a real Firebase project here, only a model of them. Use the Rules Playground checks above before the event, and do a two-phone test (Step 1 of the original README).

## If something goes wrong
Re-publish the previous rules (Firestore > Rules > History tab > pick the earlier version > Publish). The app falls back to the old way by itself.
