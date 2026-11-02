# Mundi

**A geography guessing game to play solo or with 2 to 4 friends.** Find the mystery country on an interactive globe, solve the daily challenge, or race against friends using distance clues. Collect the countries you discover as you play.

**[Play at mundi.top](https://mundi.top)** · English and Spanish · Desktop and mobile

![Mundi home screen with the world globe and solo and multiplayer choices](docs/images/mundi-home.jpg)

## Play with friends

Create a private room, share the invitation link and get ready. Play together online from different devices. You do not need to be on the same network.

- **Race:** guess independently and compete to find the country first.
- **Take turns:** alternate guesses, share distance clues and try to land the winning answer.
- **Singleplayer:** explore at your own pace with unlimited guesses and no round timer.
- **Daily challenge:** the same mystery country for everyone, renewed at 00:00 UTC. Resume your attempts, track your daily streak, share the result and keep playing in singleplayer after finishing.

Enter a country name and select a suggestion. Colors and approximate distances guide your next guess. The in-game FAQ explains the rules, territories and distance calculations.

## Your country index

Correct guesses join your collection of 195 countries, which you can explore on a globe or flat map. Search by name, filter by continent or discovery status, and sort by discovery date. The home globe highlights the countries you have found and rotates slowly. Open the index from the home screen. Find another player by username using the search field in the header, or share a public profile link. Country indexes are public by default. New accounts can opt out during registration, and any player can hide their index in the account dialog. Existing accounts without a saved visibility preference adopt the public default when they next sign in and synchronize; explicit privacy choices are preserved. Public profiles show discovered countries, with no email, discovery dates or daily history.

## Optional accounts

Play without an account and keep your discoveries, daily attempts and optional guest name in this browser. Clearing site data removes guest progress.

Sign in with Google or create an account with an email and password to merge existing guest progress into your account and synchronize discoveries and daily challenges across devices. Each account has its own local cache; switching accounts keeps their progress separate.

Choose a unique username with 3–24 characters and at least three letters. Names start with a letter, allow a–z, numbers and underscores, and are saved in lowercase. The profile icon opens your account; this is the single place to edit a signed-in username. The icon is available while the account loads, and restoring the same session keeps cached discoveries visible during synchronization. Guest display names remain optional on the home and multiplayer screens.

Public [Terms](https://mundi.top/terms.html), [Privacy](https://mundi.top/privacy.html), and [Contact](https://mundi.top/contact.html) pages are available in English and Spanish. Email registration requires an unchecked Terms acceptance box. Google and existing accounts accept the current version before account progress is imported or synced. Firestore records the version and server timestamp in a private immutable agreement document. Guest play remains available without creating an account; accepting the Terms does not authorize personalized advertising.

The live site uses Cloudflare Web Analytics for aggregate traffic and performance statistics.

## Built with

- **Languages:** TypeScript, HTML and CSS.
- **Frontend:** Vite and Three.js for the interactive globe.
- **Backend:** Node.js and Fastify, with WebSockets for real-time multiplayer.
- **Storage:** browser local storage for guest progress and account caches, optional Firebase Authentication and Cloud Firestore for account sync, and server memory for rooms.
- **Hosting:** Render.

## Run locally

Requires **Node.js 24 LTS** (24.18.1 or newer within version 24) and npm.

```sh
git clone https://github.com/faacuaramburu/mundi.git
cd mundi
npm ci
npm run dev:server
```

In a second terminal:

```sh
npm run dev
```

Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. Stop both processes with `Ctrl+C`.

Local guest games do not require a Firebase project. To enable sign-in and synchronization, copy [.env.example](.env.example) to `.env`, set `FIREBASE_WEB_CONFIG`, and follow [Firebase setup](docs/FIREBASE.md). Without account configuration, the profile icon shows an unavailable state and guest play remains usable.

Run the same verification steps used by CI:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run check:client-build
npm audit --audit-level=moderate
```

CI runs these checks on pushes and pull requests. CodeQL runs separately, and Dependabot opens dependency update pull requests. Patched `glob` and `minimatch` versions are pinned through `overrides` until their consumers adopt them; review those pins when updating dependencies rather than disabling the audit check.

## Credits and license

- Map data: [Natural Earth](https://www.naturalearthdata.com/), public domain.
- Flags: [flag-icons](https://github.com/lipis/flag-icons), MIT.
- Fonts: Barlow and Smooch Sans, SIL Open Font License.
- Code: [MIT](LICENSE).
