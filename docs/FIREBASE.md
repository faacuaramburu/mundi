# Optional Google accounts

Mundi uses Firebase Authentication (Google) and Cloud Firestore. Gameplay remains available without an account. Firebase configuration is fetched at runtime from `/api/account/config`; the account button stays hidden when configuration is absent.

## Configuration

1. Register a Firebase web app and enable Google in Authentication. Select the project support email.
2. Add `mundi.top` and any actual preview host to Authentication's authorized domains.
3. Create a Standard Firestore database and publish `firestore.rules` and `firestore.indexes.json` with `firebase deploy --only firestore --project PROJECT_ID`.
4. Set `FIREBASE_WEB_CONFIG` on the application service to a JSON object with only `apiKey`, `authDomain`, `projectId`, and `appId`. The auth domain may be `PROJECT_ID.firebaseapp.com` or the HTTPS application hostname. Redeploy the application.

### Show mundi.top during Google sign-in

The server transparently proxies the reserved `/__/auth/` helper resources to the configured Firebase project. This keeps the game on Render and does not require changing DNS or moving hosting. Only these helpers permit same-origin framing and their Firebase bootstrap scripts; the game's browser policy remains strict.

Before setting `authDomain` to `mundi.top`, add `https://mundi.top/__/auth/handler` to the existing Google OAuth web client's authorized redirect URIs in Google Cloud Console. Keep the Firebase redirect URI for fallback. `mundi.top` must also remain in Firebase Authentication's authorized domains. Change only `authDomain`; preserve the project, app ID and API key so existing accounts and progress keep working.

The web API key is public app configuration. Do not put service-account credentials, OAuth client secrets, or Firebase CLI credentials in this setting, the browser, or the repository. No Admin SDK key is needed by the game server.

## Progress and access

- Signed-in players choose a unique username: 3–24 characters, at least three ASCII letters, starting with a letter, with numbers and underscores allowed. Names are normalized to lowercase. A transaction claims `usernames/{username}` together with the owner's profile; rules reject duplicate claims, orphan reservations and cross-account changes. Renaming releases the previous reservation atomically. Guests can still choose a local display name.

- Existing guest discoveries, their known dates, daily histories, and the chosen game nickname are merged into the signed-in account. Guest data is consumed only after a durable local copy succeeds.
- Discoveries merge by union and earliest known date. Completed daily challenges take precedence; conflicting histories are not concatenated. The last 366 days are synchronized.
- Each UID has a separate browser cache. Signing out returns to guest play. Changing Google accounts does not copy the previous account's cache.
- Collection and daily changes synchronize between signed-in devices. Failed writes remain queued locally, retry after reconnecting, and can be retried from the account dialog. Do not clear browser storage while changes are pending.
- Firestore stores `players/{uid}`, `players/{uid}/progress/collection`, and `players/{uid}/daily/{YYYY-MM-DD}`. Rules allow only that UID to read or write its records, deny global player listing, and reject unknown document fields. Firebase Authentication keeps the Google identity; Google email is not used as the public game nickname.
- The project owner can view registered accounts in Firebase Console → Authentication → Users, and progress in Firestore. Players do not get access to this administration.

Progress imported from a guest browser is self-reported. This data is suitable for personal progress, not a trusted competitive leaderboard. Daily target selection and guess evaluation remain on the Mundi server.

## Verification

`npm test`, `npm run lint`, `npm run build`, and `npm run check:client-build` validate the application. Use the Firebase Auth and Firestore emulators for account switching, guest migration, offline retry, device merging, and owner-only security-rule tests. Never connect an emulator test to a production database.
