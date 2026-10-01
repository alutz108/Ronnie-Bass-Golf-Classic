# Photo album: moving photos to Firebase Storage (optional)

The app already works without this. Until Storage is turned on, photos are saved the
older way (a compressed copy inside the database). Turning Storage on makes the album
faster to open and lets photos be bigger and sharper, because the album page then loads
small thumbnails and only fetches a full photo when someone taps it.

## What it costs

Firebase now requires the **Blaze (pay as you go)** plan to create a Storage bucket.
Blaze includes a free monthly allowance (5 GB stored, 1 GB downloaded per day at the
time of writing; check the Firebase pricing page). A weekend of trip photos, a few hundred
pictures at roughly 400 KB each, is far under that, so the expected bill is $0.
To be safe, set a budget alert (Step 4) so you hear about any surprise.

If you would rather not add a card, skip all of this. The app keeps working as it does today.

## Steps

1. Firebase console, **Build, Storage, Get started**. Pick the same region as Firestore.
   (This is the step that asks you to upgrade to Blaze.)
2. Storage, **Rules** tab. Replace the contents with the `storage.rules` file in this
   package and click **Publish**.
3. Nothing to change in the app: `index.html` already has the Storage library and uses
   the `storageBucket` value in `FIREBASE_CONFIG`
   (it should look like `your-project.firebasestorage.app`).
4. Google Cloud console, **Billing, Budgets & alerts**: create a budget of, say, $5
   with email alerts.
5. Open the Photo album on a phone and add one picture. If Storage is working, the
   "saved the standard way" note under the Add photos button does not appear.
   In the Firebase console, Storage should now show a `photos/2027/` folder.

## How the app behaves

- New photos upload to Storage (about 1600 pixels, high quality). A tiny 360 pixel
  thumbnail is saved in the database record for the album grid.
- If Storage is not available (not turned on, wrong rules, no signal) the photo is saved
  the old way automatically, and a short note appears on the album page.
- Photos added before this change keep working. They are shown from the database.
- Deleting a photo removes it from both the album and Storage.
- Backups from Admin do not include photos.

## Not tested against a real Firebase project

This was built and tested with a simulated Storage service, not a live project. Please
do the one-picture check in Step 5 before the trip.
