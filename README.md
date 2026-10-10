# Mundi

Find the mystery country, one guess at a time. Explore an interactive globe, follow distance clues and collect your discoveries.

**[Play at mundi.top](https://mundi.top)** · English and Spanish · Desktop and mobile

![Mundi home screen with the world globe and solo and multiplayer choices](docs/images/mundi-home.jpg)

## How to play

Enter a country name, choose a suggestion and submit your guess. Colors and approximate distances help you get closer; countries sharing a land border show a special hint. Drag to rotate the globe and scroll or pinch to zoom.

The FAQ explains the 195-country catalog, territories and distance calculations. The country index displays the countries you have personally guessed correctly on a globe or flat map.

## Game modes

| Mode | How it works |
| --- | --- |
| Singleplayer | Find a country at your own pace, with unlimited guesses and no round timer. |
| Multiplayer: Race | Private rooms for 2–4 players. Everyone guesses independently; the first correct guess wins. If nobody finds it, the closest guess wins, with ties resolved by guess number and then server arrival order. |
| Multiplayer: Take turns | Share clues and alternate guesses. Each turn lasts 30 seconds. An exact answer wins; otherwise the round ends in a draw. |

Create a room and share its invitation link. All players confirm readiness before starting and agree to a rematch afterward. Multiplayer supports unlimited guesses or a quota of 5, 8, 10 or 15 per player. Race rounds last up to three minutes; turn-based rounds last up to ten.

## Progress and sessions

- Your optional display name, country index, language and theme are saved in this browser. There are no accounts, passwords or cross-device synchronization.
- Progress belongs to the site origin. Clearing site data removes it, and progress from the old Render address does not transfer automatically to `mundi.top`.
- Reloading or returning to your game restores your seat while the room and session exist. Clocks keep running during disconnections.
- Rooms are stored in server memory, expire within 30 minutes and disappear after a server restart or deployment. The country index remains in your browser.
- Use separate browser profiles or private windows to test multiple players on one computer; tabs in one profile share a session.

## Run locally

Requires **Node.js 24 LTS** (24.18.1 or newer within version 24) and npm.

```sh
git clone https://github.com/faacuaramburu/mundi.git
cd mundi
npm ci
npm run dev:server
```

Keep the server running and start the frontend in a second terminal:

```sh
npm run dev
```

Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. Development includes a local practice mode. Local defaults require no configuration; copy `.env.example` to an ignored `.env` only if needed. Stop both processes with `Ctrl+C`.

## Checks

```sh
npm run lint
npm test
npm run build
npm run check:client-build
npm audit
```

The build runs TypeScript checks. The client check verifies that development practice code and the server's distance matrix are excluded from the production assets. GitHub Actions runs these checks, with CodeQL and Dependabot configured for ongoing review.

## Deployment

Mundi runs one Node.js service that serves the built frontend and multiplayer over WebSockets. `render.yaml` provides a Render configuration; the current public deployment is **https://mundi.top**.

Set these production environment variables on your host:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `APP_ORIGIN` | Your exact HTTPS origin, such as `https://mundi.top`, without a trailing slash or path |
| `PORT` | Supplied by the host; defaults to `3000` |

Build with `npm ci --include=dev && npm run build && npm run check:client-build`, then start with `npm start`. Your host must terminate HTTPS and forward WebSocket upgrades. Health checks use `/health`.

On Render, `RENDER_EXTERNAL_URL` is the default origin when `APP_ORIGIN` is absent. Set `APP_ORIGIN` when using a custom domain. Render subdomain page requests redirect to the configured origin. Run a single instance: rooms and sessions are not shared between processes. The current free deployment can sleep when inactive, so the first request may take longer.

## Security and privacy

The server validates requests and game actions, authorizes seats with random session credentials, checks the exact origin for mutations and WebSocket connections, and uses `HttpOnly`, `SameSite=Strict`, `Secure` cookies in production. Active games do not disclose the secret country or opponents' private guesses. Responses use a restrictive content security policy and do not cache session data.

Room, connection and message limits bound resource use. Anyone with an invitation can join an available seat, so share links only with intended players. Display names are labels, not verified identities, and the browser's country index is a personal collection, not a protected leaderboard.

Keep secrets out of the repository and update dependencies regularly. The server does not trust forwarded IP headers by default; deployments behind a proxy may share IP rate limits. Configure a verified proxy allowlist before scaling public traffic rather than trusting arbitrary forwarding headers; see [Fastify's proxy guidance](https://fastify.dev/docs/latest/Reference/Server/#trustproxy).

## Built with

TypeScript, Vite, Three.js, Fastify and WebSockets. No database is required.

## Credits and license

- Map data: [Natural Earth](https://www.naturalearthdata.com/), public domain.
- Flags: [flag-icons](https://github.com/lipis/flag-icons), MIT.
- Fonts: Barlow and Smooch Sans, SIL Open Font License; license files are included in `src/client/fonts`.
- Code: [MIT](LICENSE).
