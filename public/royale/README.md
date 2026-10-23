# Chip Royale – Premium Blackjack (standalone)

This is the real Chip Royale client (`app.js`, `premium.js`, `seats.js`, `cards.js`, `style.css`, `index.html`), running against a local engine instead of the server.
It uses play chips only, and there's no server, WebSocket or build step.

## Run
Open `index.html`, or serve the folder statically (for example `python3 -m http.server`). Use a static server if your browser restricts `file://`.

## How it works
- `local-server.js` replaces `window.WebSocket` with a local socket that speaks the same messages as the live server.
- The rules are ported from `server.js`: 6-deck shoe, the dealer hits to 16 and stands on all 17, peek and insurance on an Ace, blackjack pays 3:2, double, split up to 4 hands, surrender and the pair side bet.
- Bots are optional, use simple strategy and bet automatically.
- If you drop below the table minimum you get a free rebuy. Chips are saved in `localStorage`.
- Changes to the copied client:
  - `avUrl` reads avatars from the config.
  - The service-worker registration is removed.
  - CSS `img/` paths now point to `assets/img/`.
  - `index.html` loads `config.js`, `local-server.js` and `assets.js`.

## Layout
```
index.html, style.css, app.js, premium.js, seats.js, cards.js   Chip Royale client (Premium skin)
coinsim.js, roulette.js   referenced by the client; not used here
config.js        THE asset map + table settings
local-server.js  local game engine + fake socket
assets.js        applies config asset paths and sound files
assets/img/      card back, felts, avatars, lobby background
assets/sounds/   empty; add your own files
```

## Swap assets
Edit `config.js`:
- `assets.cardBack`, `felt`, `feltAlt`, `lobbyBg`, `chipImage`: image paths. If one is `null`, the built-in art is used.
- `assets.avatars[]`: avatar images. Seats choose one by index.
- `assets.sounds.{deal,flip,chip,tap,pop,win,lose,bj,turn}`: audio files. If one is `null`, the built-in synth plays.
- `game`: tier (sets limits, chip values and Premium palette), starting and rebuy chips, your seat, bots, skin and timers.

The Premium table art itself (rail, chip tray and perspective felt) is drawn at runtime by `premium.js` and styled under `#table.premium` in `style.css`.
