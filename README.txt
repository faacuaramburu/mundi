Mundi

A geography game for you and your friends: find a mystery country on an interactive globe. Each guess shows its approximate distance in kilometers. Colors help you get closer, and a special hint tells you when countries share a land border.

How to play

Type a country name in English or Spanish, select a suggestion, and press Guess. Use the distances and colors to guide your next guess. Drag the globe to rotate it and scroll or pinch to zoom. Switch the interface language with the Español / English button.

The game starts in dark mode. Use the sun/moon button in the header to choose light mode; your choice is remembered in this browser.

Open FAQ in the header to see which countries are accepted, how territories are handled, how distances are calculated, and the full country index.

Zooming closer to the globe makes dragging less sensitive.

Use the arrow beside Guesses to sort by proximity. In the country index, switch between Globe and Flat map; drag and zoom to explore your discoveries. Hover over a discovered country to see its name.

Choose Singleplayer at home to play without a guess or round time limit. Personally correct countries join your Country index, with a world map and collection out of 195. Progress is saved in this browser; clearing site data removes it. There are no accounts or synchronization between devices.

Set your optional name at home or in the multiplayer lobby and press Save. Friends see it during games and in results. Leave it empty to play as a guest. The name is remembered in this browser; changing it does not change your index.

For Multiplayer, one player creates a private room for 2–4 players, chooses Race or Take turns, sets unlimited guesses or a quota of 5, 8, 10, or 15, and shares the invitation link. Everyone joins and presses I'm ready for a three-second countdown.

In a race, everyone has three minutes and their own clues; only rival progress is visible. The first correct guess wins. Otherwise, the closest guess wins; ties use guess number, then server arrival order. In limited mode, using all quotas or 60 seconds without new valid guesses ends the round.

With turns, everyone sees the shared guesses and clues. Each player has 30 seconds for one valid guess, then the turn moves on. Invalid and duplicate guesses do not spend a turn or quota. Skipped turns keep the game moving during disconnections. The round lasts at most ten minutes; only an exact answer wins, otherwise it is a draw. Results show the country and histories. Everyone must accept a rematch.

Reloading keeps your seat. Clocks continue during disconnections. Rooms expire after at most 30 minutes and disappear when the server restarts; your saved index remains. For multiple players on one computer, use separate browser profiles/private windows; tabs in one profile share a player.

Open and run the game

Install Node.js 24 LTS. Download or clone Mundi (https://github.com/faacuaramburu/mundi), then open its folder in VS Code with File → Open Folder.

Open a terminal in that folder and install the dependencies:

npm ci

Start the server:

npm run dev:server

Keep it running and open a second terminal to start the web page:

npm run dev

Open 127.0.0.1:5173 (http://127.0.0.1:5173/) in your browser. Saving changes updates the page automatically. Stop both terminals with Ctrl+C when finished. Development also has a Practice link. These local addresses are accessible only on your computer; an HTTPS deployment is needed to share invitations between computers.

To run the production build, set NODE_ENV=production and APP_ORIGIN to your exact HTTPS site origin in an ignored .env, then run npm run build and npm start. The host must forward WebSocket connections.

For free hosting on Render, sign in at https://dashboard.render.com/ and create a Blueprint from the Mundi repository using render.yaml. It runs the page and multiplayer server together on one Free web service. Render supplies the HTTPS address automatically; for a custom domain, set APP_ORIGIN to that exact HTTPS origin. Use the assigned address to create and share rooms.

The Free service sleeps after 15 minutes without activity and can take about a minute to wake up. Rooms disappear when the server restarts; the country index remains in each browser. Render applies monthly usage limits. Without a payment method, exceeding those limits suspends services or builds rather than charging for extra usage.

Map data: Natural Earth (https://www.naturalearthdata.com/), public domain. Flags: flag-icons (https://github.com/lipis/flag-icons), MIT. Code: MIT license.

If you leave a multiplayer room, use Return to your game on the home or
multiplayer screen to recover your seat and attempts in the same browser.
The clock keeps running. This works while the room exists and your browser
session is retained; rooms disappear when the server restarts.
