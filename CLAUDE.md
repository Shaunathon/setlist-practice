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
- **A YouTube player that has never played reports `getCurrentTime() === 0`**
  however far you seek it. `useYouTubePlayer` keeps a `startedRef` and trusts its
  own optimistic position until the player has entered PLAYING once — otherwise
  "Set A" on a scrubbed-but-unplayed video records zero.
- **Never put two background utilities on one element** (`bg-panel-2` from the
  base class plus `bg-gold` from the "on" class). Tailwind emits both and
  stylesheet order picks the winner regardless of class-attribute order, which
  silently left armed toggles as dark text on a dark background. Toggles go
  through `toggleBtn(on)`, which picks exactly one treatment.

### Loops

A song holds an ordered `loops: [{ id, a, b }]` plus one `activeLoopId`. Only the
active section repeats — arming one disarms the others.

**Labels come from position, never storage**: row 0 is A/B, row 1 is C/D. Delete
a row and everything below re-letters itself, so never persist a label.

Selecting a section always drops the playhead at its start, whether via the
row's Loop button or by clicking the section on the scrub bar. Seeking anywhere
that isn't a section releases the armed one and plays on from exactly there.

Each endpoint is trimmed by arrows flanking its own Set button (`◂ Set A ▸`),
which moves 100ms per click. The arrow's position *is* the endpoint selection —
there is deliberately no "select an endpoint, then nudge" step, because the bug
that removed marker dragging was exactly a hidden selection mechanism.

Nudging a **start** point also seeks the playhead to it, so you hear whether the
section now catches the pickup; nudging an **end** point does not, since you'd
hear that on the loop's next pass and jumping mid-phrase is disorienting. The
asymmetry is intentional — don't "fix" it.

Trimming only ever applies to the armed section: the other rows' arrows are
disabled, and the shift/alt keys follow the armed section rather than the
last-row fallback the Set keys use, so the keyboard can't edit a section whose
own buttons are greyed out.

`setPoint` clears a partner point that the new one invalidates, in both
directions, so a section can never end up backwards or zero-length — except
when the two land within one nudge step of each other, which is a no-op: there's
no useful section to record, so the existing point survives instead of being
wiped.

Pressing `A` on a song with no sections creates the row *and* marks the point
(`startSectionAt`). The bare `addLoop` behind the `+` button makes an empty row;
never route a Set key through it, or the keypress silently records nothing.

The transport row is asymmetric on purpose: the left button is skip-to-start
(the armed section's start, or the track's if nothing is armed) rather than a
5-second rewind, while the right button still nudges forward 5s. Back-by-5s
lives on the left arrow key.

**The scrub bar's section markers must stay `pointer-events: none`.** They were
draggable once; practice loops are only a percent or two of the bar, so the drag
targets covered the region and swallowed the clicks meant to select it. Points
are moved with the Set buttons.

Both engines only understand a single loop, so `SongCard.activeLoopFor()`
flattens the armed section into the `{ loopA, loopB, loopOn }` shape `loopRef`
carries. Settings saved before this existed used `loopA`/`loopB`/`loopOn`
directly; `migrateSongSettings` in `storage.js` folds those into the first row,
so don't reintroduce reads of the old keys.

### Backup import must merge, never replace

`importAll` matches shows by id and leaves everything else alone. It is the only
way to move work between the deployed site and localhost — separate origins mean
separate `localStorage` — so a file exported from one must never delete shows
that exist only on the other. It once did `write(SHOWS_KEY, data.shows)` and
silently destroyed two shows on the live site. It returns a tally so the UI can
report what actually happened.

### Playlist caching

Successful responses carry `s-maxage=300`, so Netlify's edge answers repeat
requests for five minutes without invoking the function or calling YouTube —
which is what keeps public traffic off the API quota. Errors are never cached.

Because of that, an explicit Refresh appends `&t=<timestamp>` to force a miss.
Without it the button whose entire purpose is "pick up newly added songs" could
return the same list for five minutes.

### Removed videos

The shared playlists carry several versions of the same tune and can't be edited,
so `sp:removed:<showId>` is a personal filter over someone else's playlist —
nothing is ever written to YouTube. Removals persist across reloads; **Refresh is
the deliberate re-sync** that clears the list and picks up new additions.
Per-song settings are deliberately left in storage when a video is removed, so a
song that comes back still has its loop sections and notes.

### The playlist function

`netlify/functions/playlist.js` proxies the YouTube Data API so `YOUTUBE_API_KEY`
never reaches the browser. It paginates to 200 videos, drops deleted/private
placeholder entries, and sets a 5-minute edge cache.

`ShowPage` checks the response `content-type` before parsing: a dev server
without the function attached answers `/api/*` with the SPA's `index.html` at
status 200, which would otherwise be read as an empty playlist.
