# 40 Love

A tennis club for players forty and over. Courts, open hits, coaching, monthly social gatherings, and good company nearby.

Built by Joyce and her mom, for the love of connecting with others on the court.

---

## Quick start (VS Code)

1. Open this folder in VS Code (`File → Open Folder…`).
2. Accept the recommended extensions when prompted (Live Server, ESLint, EditorConfig).
3. Open a terminal (`Ctrl+`` ` `` / `` Cmd+` ``) and run:

```bash
npm install     # once, installs dev tools only (ESLint + the test runner)
npm start       # dev server → http://localhost:5173
```

Or skip the terminal entirely: right-click `src/index.html` → **Open with Live Server**.

The app has no runtime dependencies. There is nothing to compile.

## Scripts

| Command         | What it does                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `npm start`     | Serves the source at `http://localhost:5173`                                 |
| `npm run build` | Inlines CSS + JS into a single shareable file: `dist/40Love.html`            |
| `npm test`      | Builds, then clicks through every feature in a simulated browser (55 checks) |
| `npm run lint`  | ESLint over `src/`, `scripts/`, `test/`                                      |

VS Code tasks are wired to the same commands (`Terminal → Run Task…`), and `F5` launches Chrome against the dev server.

## Sharing the demo

`dist/40Love.html` is the whole app in one file. Email it, AirDrop it, or open it from a USB stick — it runs by double-click in any modern browser, on desktop or phone, with no install. Run `npm run build` after editing anything in `src/`.

## Project layout

```
40love/
├─ src/
│  ├─ index.html      shell, meta, Content-Security-Policy
│  ├─ styles.css      design tokens + components (pastel green · white · soft mocha)
│  └─ app.js          all application logic (see the section map at the top of the file)
├─ scripts/
│  ├─ serve.js        zero-dependency dev server
│  └─ build.js        single-file bundler with a post-build syntax check
├─ test/app.test.js   behavioral test suite (jsdom)
├─ dist/40Love.html   built artifact — the shareable demo
├─ docs/PITCH.md      one-page investor brief
└─ .vscode/           recommended extensions, settings, launch + tasks
```

## What the demo does today

- **Launch pad** with the founders' note, then a 40+ membership gate.
- **Map** (Apple-Maps style) with court pins, open-hit counts, zoom, recenter, and a draggable bottom sheet.
- **Search** that filters hits and dims non-matching courts as you type.
- **Open hits**: browse, view a member's profile and NTRP rating, request to join, or **start your own hit** from any court.
- **Social gatherings**: the Second Friday pub social (RSVP with live counts) and club trips, starting with Indian Wells.
- **Lessons**: coach marketplace with Pro Partner badges, time-slot reservation, and a coach application flow that presents both monetization plans (15% partner share or $29/mo Pro subscription).
- **Chat**: citywide Clubhouse room, group rooms that open automatically when you join a hit or RSVP, and direct messages from any profile.
- **Memory**: joins, RSVPs, created hits, reservations, and messages persist between visits. "Our story" (tap the logo) includes a *Reset demo data* control for presentations.

## Engineering notes

**No framework, on purpose.** ~800 lines of plain JS render HTML strings into one root element with targeted updates (a chat message appends one bubble; a search keystroke re-renders only the list). It loads in a few milliseconds and has no dependency surface to patch.

**Security posture (client-side).**
- Every dynamic value passes through an HTML escaper; there is no `innerHTML` of raw user text anywhere.
- User input is sanitized (control characters stripped, whitespace collapsed, hard length caps) and rate-limited (send cooldown, bounded history).
- `localStorage` is treated as **untrusted input**: on load every field is type-checked, whitelisted against known values, and re-cleaned. The test suite feeds it forged data and confirms it is rejected.
- A `Content-Security-Policy` forbids network requests, frames, and foreign resources; `referrer` is disabled.
- All static data is deep-frozen; the app lives in a closure and exposes nothing on `window`.
- A global error handler renders a graceful fallback instead of a blank screen.

**Accessibility.** Full keyboard navigation (Tab to pins, Enter/Space to open, arrows to resize the sheet, Escape to close dialogs), managed focus for dialogs, ARIA roles/labels/live regions, visible focus rings, and `prefers-reduced-motion` respected.

## Road to production

This is a complete front-end base. Turning it into a live product means adding a backend; the UI is already shaped for it.

1. **Accounts & 40+ verification** — sign-in plus an age check (ID verification vendor or a card-on-file check).
2. **API + database** — courts, hits, RSVPs, lessons, and members; replace the in-file data and `localStorage` with API calls (each screen already has a single data source to swap).
3. **Real-time chat** — WebSocket service with moderation and reporting; the room model (`city`, `hit:<id>`, `ev:<id>`, `dm:<id>`) is already in place.
4. **Maps** — a maps SDK (Apple MapKit JS, Mapbox, or Google) driving real GPS and court data; the pin/sheet interaction is SDK-agnostic.
5. **Payments** — Stripe for coach subscriptions, the partner revenue share, lesson checkout, and event tickets.
6. **Native shells** — the app is already phone-sized and touch-first; wrap it (Capacitor) for the App Store and Google Play, or rebuild the views in React Native reusing the same data model.

## License

Private. © 2026 Joyce and family. All rights reserved.
