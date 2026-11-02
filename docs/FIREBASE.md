# Optional accounts

Mundi uses Firebase Authentication (Google and email/password) and Cloud Firestore. Gameplay remains available without an account. Firebase configuration is fetched at runtime from `/api/account/config` alongside the map load. The profile icon is visible immediately; its dialog shows loading and retry states when configuration is absent or unavailable, without blocking guest play.

## Configuration

1. Register a Firebase web app and enable Google and Email/Password in Authentication. Select the project support email. Keep email-link sign-in off. Set a required password policy with a minimum of 8 characters and keep email enumeration protection enabled.
2. Add `mundi.top` and any actual preview host to Authentication's authorized domains.
3. Create a Standard Firestore database and publish `firestore.rules` and `firestore.indexes.json` with `firebase deploy --only firestore --project PROJECT_ID`.
4. Set `FIREBASE_WEB_CONFIG` on the application service to a JSON object with only `apiKey`, `authDomain`, `projectId`, and `appId`. The auth domain may be `PROJECT_ID.firebaseapp.com` or the HTTPS application hostname. Redeploy the application.

### Show mundi.top during Google sign-in

The server transparently proxies the reserved `/__/auth/` helper resources to the configured Firebase project. This keeps the game on Render and does not require changing DNS or moving hosting. Only these helpers permit same-origin framing and their Firebase bootstrap scripts; the game's browser policy remains strict.

Before setting `authDomain` to `mundi.top`, add `https://mundi.top/__/auth/handler` to the existing Google OAuth web client's authorized redirect URIs in Google Cloud Console. Keep the Firebase redirect URI for fallback. `mundi.top` must also remain in Firebase Authentication's authorized domains. Change only `authDomain`; preserve the project, app ID and API key so existing accounts and progress keep working.

The web API key is public app configuration. Do not put service-account credentials, OAuth client secrets, or Firebase CLI credentials in this setting, the browser, or the repository. Basic accounts do not need an Admin SDK key. The optional custom email delivery described below uses a separate, narrowly scoped server credential.

## Passwords and recovery

Firebase Authentication owns password credentials and hashing. Passwords are not saved in Firestore, local storage, game analytics, or application logs. The password field is cleared after successful sign-in, registration, mode changes, and dialog close. Standard password-manager autocomplete and a Show/Hide control are available.

Registration sends an address-verification email and leaves the account pending until the link is confirmed. Pending users can play as guests, resend the verification email, and check its status from the account dialog. Returning to the tab also checks verification; the client reloads the Firebase user and refreshes the ID token before continuing. Google accounts normally arrive with their email already verified. Reset requests show the same confirmation for existing and unknown addresses.

Unverified identities cannot read or write account profiles, discoveries, daily progress, or username reservations under the Firestore rules. The only permitted account write before verification is the immutable Terms acceptance from registration. Guest data is merged only after both verification and agreement acceptance. Firebase Authentication still retains a pending Auth record; sending an email alone does not activate it or prove ownership.

The account action page is available at `https://mundi.top/cuenta/accion.html`; `/__/auth/action` forwards to it on the same domain. The page handles verification, password resets, email recovery and the other supported Firebase account action codes with the existing Firebase SDK. It validates codes against the project's runtime configuration, never trusts a query-supplied project/API key or redirect URL, and removes action parameters from the address bar after reading them. Password reset requires a valid code and two matching passwords, and does not sign in automatically. Error, expired/used-code and connection-retry states are available in English and Spanish, with both site themes.

Deploy the action page before changing Authentication → Templates → Customize action URL (the project setting `notification.sendEmail.callbackUri`) to `https://mundi.top/__/auth/action`. This changes future emails; messages already sent retain their original links and continue using the previous hosted handler. Keep Google sign-in's `/__/auth/handler` separate from email action links.

Firebase's default email templates retain `https://mundi-c6fa3.web.app/__/auth/action` as their fallback URL. The project rejects custom callback updates with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`, including an atomic custom-SMTP update. The Mundi frontend therefore uses its own server email endpoint when configured: Firebase Admin generates a verification or reset code, the server constructs a link on `APP_ORIGIN` at `/cuenta/accion.html`, and Resend delivers the email. The action page still validates and applies the code directly with Firebase. Existing emails and Google sign-in keep their previous handlers.

### Custom account email delivery

Set these two **server-only** environment variables in Render, preserving the existing `APP_ORIGIN` and public Firebase configuration:

- `RESEND_API_KEY`: a Resend **Sending access** key limited to the verified `mundi.top` domain.
- `FIREBASE_MAIL_SERVICE_ACCOUNT`: JSON for the dedicated mail service account in the same Firebase project. Its custom IAM role needs only `firebaseauth.users.sendEmail`. Do not use a project-owner credential or a Firebase CLI refresh token.

Both variables are required together. Startup validates the key, RSA credential and project match; the public configuration exposes only `customEmail: true`. No private credentials enter client assets. Keep open and click tracking disabled for these security emails. The sender is `Mundi <noreply@HOSTNAME>`, using the canonical `APP_ORIGIN` hostname.

`POST /api/account/email` accepts only verification and reset requests from the canonical origin. Verification requires a valid Firebase ID token, and authenticated requests always use the email in that token. Public reset requests return the same confirmation for an unknown account. Arbitrary message content, destinations for redirects and action links supplied by a client are rejected. Provider errors and action codes never appear in endpoint responses or application logs.

Limits apply per recipient (60-second cooldown, three requests per hour), per server minute (10), per process day (90) and to concurrent sends (four). Recipient identifiers are hashed and expire after an hour. These counters are in memory for the current single Render instance and reset on restart; use shared persistent quotas before scaling to multiple instances or relying on a durable billing cap. A delivery failure displays an error instead of claiming an email was sent or silently switching to Firebase's old link domain.

The delivery integration was checked with real Firebase action codes and Resend's labeled `delivered+…@resend.dev` test sink. Verification and password reset succeeded on the same disposable Firebase UID, which was removed afterward. No existing player's password was changed.

Signed-in Google users can request **Change password**. Completing the email link sets a password on that same Firebase account rather than creating a second player. The unique game username is a public display name, not a login identifier. Sign-in uses Google or email/password.

## Progress and access

- Before importing guest progress or syncing an account, the client checks `players/{uid}/agreements/{version}`. Email sign-up requires an explicit unchecked checkbox; Google and existing accounts without the current agreement see an acceptance form. The agreement contains only `version` and `acceptedAt` (server timestamp). Rules allow the owner to create only the current version, reject updates/deletes and other fields, and block account data writes before acceptance. Keep `src/shared/legal.ts`, the public legal pages and the rule version aligned when publishing new Terms. Retain published versions in repository history.

- Signed-in players choose a unique username: 3–24 characters, at least three ASCII letters, starting with a letter, with numbers and underscores allowed. Names are normalized to lowercase. A transaction claims `usernames/{username}` together with the owner's profile; rules reject duplicate claims, orphan reservations and cross-account changes. Renaming releases the previous reservation atomically. Guests can still choose a local display name.

- Existing guest discoveries, their known dates, daily histories, and the chosen game nickname are merged into the signed-in account. Guest data is consumed only after a durable local copy succeeds.
- Discoveries merge by union and earliest known date. Completed daily challenges take precedence; conflicting histories are not concatenated. The last 366 days are synchronized.
- Each UID has a separate browser cache. Restoring the same authenticated UID keeps its cached discoveries visible while the agreement is checked; synchronization and username writes still wait for acceptance. Signing out returns to guest play. Changing accounts clears the previous visible scope immediately and does not copy its cache.
- Collection and daily changes synchronize between signed-in devices. Failed writes remain queued locally, retry after reconnecting, and can be retried from the account dialog. Do not clear browser storage while changes are pending.
- Firestore stores `players/{uid}`, `players/{uid}/progress/collection`, and `players/{uid}/daily/{YYYY-MM-DD}`. Rules allow only that UID to read or write its records, deny global player listing, and reject unknown document fields. Firebase Authentication keeps login identities; email is not used as the public game nickname.
- The project owner can view registered accounts in Firebase Console → Authentication → Users, and progress in Firestore. Players do not get access to this administration.

Progress imported from a guest browser is self-reported. This data is suitable for personal progress, not a trusted competitive leaderboard. Daily target selection and guess evaluation remain on the Mundi server.

## Verification

For verified deletion requests, use the Firebase project administrator account: verify ownership, recursively delete the player's Firestore document and all subcollections (including progress, daily histories and agreements), release its `usernames/{username}` reservation, and delete the matching Authentication user. Deleting only the Authentication user does not remove Firestore data. Advise the player to clear site data on their devices to remove local caches. Handle these requests privately through the project contact channel; never put account details in a public issue.

`npm test`, `npm run lint`, `npm run build`, and `npm run check:client-build` validate the application. Use the Firebase Auth and Firestore emulators for account switching, guest migration, offline retry, device merging, and owner-only security-rule tests. Never connect an emulator test to a production database.

With the Firebase CLI and Java installed, run the email-verification and ownership rule regressions locally:

```sh
firebase emulators:exec --only firestore --project demo-mundi-rules "npm run test:rules"
```

The script requires a loopback `FIRESTORE_EMULATOR_HOST` and always targets the disposable `demo-mundi-rules` project.
