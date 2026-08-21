# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm install
npx netlify dev   # dev server WITH the playlist function (use this)
npm run dev       # UI only — every playlist fetch will fail
npm run build     # production build to /dist
```

## Architecture

React 19 + Vite SPA, Tailwind v4 via `@tailwindcss/vite`, deployed to Netlify.
Conventions follow the sibling `band-website` project, including the colour
palette (dark blue ground, gold `#DFAB29`, rust `#D54514`, cream text) and the
Bebas Neue / PT Sans font pairing.

There is no database. Shows and per-song practice settings live in
`localStorage` (`src/lib/storage.js`, keys prefixed `sp:`). The only server-side
code is one Netlify Function.

### The two playback engines

Each `SongCard` owns both, and only one makes sound at a time:

- `useYouTubePlayer` — wraps the IFrame Player API. Speed is limited to the
  discrete values from `getAvailablePlaybackRates()`. **Pitch control is
  impossible here** and always will be: the audio is inside a cross-origin
  iframe, so Web Audio can't reach it. Don't try to add transpose to this path.
- `useAudioEngine` — SoundTouchJS `PitchShifter` over a user-supplied local
  file. Independent continuous tempo and ±12 semitone pitch.

### Things that will bite you

- **`YT.Player` replaces the DOM node you hand it.** `useYouTubePlayer` appends
  a disposable child div and targets that. Passing the React-managed ref node
  directly leaves an orphaned, still-audible player behind on StrictMode's
  double-mount.
- **Loop enforcement uses `setInterval`, not `requestAnimationFrame`.** rAF is
  suspended in background tabs, which would silently stop the loop the moment
  you switch away to read a chart.
- **`PitchShifter.percentagePlayed` is asymmetric** — the getter returns 0–100,
  the setter expects a 0–1 fraction. `useAudioEngine.seek` wraps it; don't use
  the raw property elsewhere.
- **Loop values are passed as a ref (`loopRef`), not props.** The polling
  callbacks read `loopRef.current` so loop edits apply instantly without
  rebuilding the interval.
- **Don't depend on a hook's whole return object in a `useEffect`.** These hooks
  return fresh object literals every render; depend on the individual `useCallback`
  values or the effect fires 20 times a second.

### The playlist function

`netlify/functions/playlist.js` proxies the YouTube Data API so `YOUTUBE_API_KEY`
never reaches the browser. It paginates to 200 videos, drops deleted/private
placeholder entries, and sets a 5-minute edge cache.

`ShowPage` checks the response `content-type` before parsing: a dev server
without the function attached answers `/api/*` with the SPA's `index.html` at
status 200, which would otherwise be read as an empty playlist.
