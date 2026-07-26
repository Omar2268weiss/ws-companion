# WS Companion — Web App (iPhone, zero setup)

This is the same app as the Swift/Xcode version, rebuilt as a self-contained web
app so it runs entirely on your iPhone — no Mac, no Xcode, no Apple Developer
account, nothing to install.

It has the same five tools:
- **Cards** — searchable/filterable database (1,406 hololive production entries bundled)
- **Decks** — build/save decks (50-card / 8-climax tracking), saved on your phone
- **Life** — level/clock/stock/hand/waiting room/memory counters for both players
- **Turn** — steps through the 8 WS phases
- **Solo Play** — a from-scratch rules engine (core turn structure, costs, combat,
  win condition) plus a full **manual board manager** — every zone for both
  players, tap any card to move it anywhere, toggle Reversed/Resting, nudge Power.
  Same scope/limits as before: it does not execute individual card abilities —
  that's what the manual board manager is for.

All your decks, life totals, and turn state are saved with `localStorage`,
right on your phone — nothing is sent anywhere.

## How to run it on your iPhone — no computer needed

1. **Download and unzip.** Tap the zip file from this chat — it'll save into
   the Files app. Tap it there and iOS will unzip it into a folder automatically.
2. **Open `index.html`.** In the Files app, tap `index.html` — it opens in
   Quick Look preview.
3. **Tap the Share button** (square with an arrow, top-right of Quick Look),
   then choose **"Open in Safari."** This loads it as a real web page with
   JavaScript fully running (Quick Look's preview alone won't run the app —
   this step matters).
4. **Add to Home Screen** (optional but recommended): with the page open in
   Safari, tap the Share button → **Add to Home Screen**. You'll get a real
   app icon that opens full-screen, no browser chrome.

That's it — everything after this runs 100% offline except card artwork images
(those load from the official card list site, so you'll want a connection the
first time you browse a card, though the app's functionality itself works with
no connection at all).

## If you'd rather have a stable URL (optional)

Opening the local file works fine, but if you ever want a "real" address (so
you can open it fresh in Safari without re-unzipping, or share it with someone
else to try), you can host these same files for free on **GitHub Pages**:

1. Create a free GitHub account (from Safari, works fine on mobile).
2. Create a new repository, upload these files (`index.html`, `styles.css`,
   `app.js`, `data.js`, `manifest.json`, `icon.png`) through GitHub's web
   upload UI.
3. In the repo's Settings → Pages, enable GitHub Pages for the main branch.
4. You'll get a URL like `https://yourname.github.io/reponame/` — open that
   in Safari and "Add to Home Screen" from there instead.

This step is entirely optional — the zip works standalone with no account of
any kind.

## Adding more card sets

The bundled `data.js` has the full "hololive production" title. To add another
franchise, use `scrape_ws.py` from the Xcode version of this project (or ask me
to run it for a specific title and hand you an updated `data.js`) — it's the
same official EN card list scraper, just producing a JS file instead of Swift
JSON resources.

## Scope reminder (same as the native version)

Solo Play resolves turn structure, costs, color/level legality, damage, and
the Level-4 loss condition using printed stats only. It does not run the
individual 【AUTO】/【CONT】/【ACT】 card effects — hundreds of unique,
often-interacting abilities is a much bigger project. The **Board Manager**
in Solo Play is built specifically so you can resolve any of those effects
yourself: move any card in or out of any zone, on either side, and toggle
Reversed/Resting or adjust Power directly.
