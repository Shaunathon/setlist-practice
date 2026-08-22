# Setlist Practice

One page per upcoming show. Each page pulls the songs from that show's YouTube
playlist and gives every song its own transport: A–B repeat loops, playback
speed, notes, and a "learned" checkbox. A metronome
([tacotacoburrito.com](https://tacotacoburrito.com)) is docked in the corner and
keeps its tempo while you move between songs.

## Setup

```bash
npm install
```

Create an API key in the same Google Cloud project you used for the playlist
generator — enable **YouTube Data API v3**, then restrict the key to that API —
and put it in `.env`:

```bash
cp .env.example .env
```

The key is read only by the Netlify Function. It is never bundled into the
browser build.

## Running it

The playlist endpoint is a Netlify Function, so use the Netlify CLI rather than
plain Vite — `npm run dev` alone serves the UI but every playlist fetch fails:

```bash
npx netlify dev
```

That serves the app on **http://localhost:8888** — not 5174. Vite still runs on
5174 underneath, but only the 8888 address has the playlist function attached.
`netlify.toml` pins that wiring in a `[dev]` block; without it Netlify's
framework detection assumes Vite's default port 5173 and waits forever on a port
nothing is listening to.

For deployment, set `YOUTUBE_API_KEY` in the Netlify site's environment
variables. `netlify.toml` already wires up the build, the function directory,
and the SPA fallback.

## Playlists must be public or unlisted

An API key can read public and unlisted playlists but not fully private ones —
those require OAuth. The playlist generator creates unlisted playlists, which
work fine.

## What the controls can and can't do

Two playback engines sit behind each song, and the difference between them is a
hard platform limit rather than a design choice:

| | YouTube | Attached audio file |
|---|---|---|
| A–B repeat loop | yes | yes (sample-accurate) |
| Speed | the 8 steps YouTube allows (25–200%) | continuous 25–200% |
| Transpose | **impossible** | ±12 semitones |

**Why transpose can't work on YouTube.** The IFrame Player API exposes
play/pause/seek/`setPlaybackRate`/volume and nothing else — there is no pitch
control. The underlying `<video>` element lives inside a cross-origin
`youtube.com` iframe, so the same-origin policy blocks
`createMediaElementSource()` and the audio can never be routed through Web
Audio. The Transpose Chrome extension works only because an extension injects a
content script *into youtube.com itself*, where the audio is same-origin. A
website cannot do that.

So: drop an audio file onto a song card and it switches to a
[SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) engine that
time-stretches and pitch-shifts independently — the same class of algorithm
Amazing Slow Downer uses. Speed and key become separate controls. MP3, WAV, M4A,
and FLAC all decode.

## Keyboard shortcuts

Click a song card first, then:

| Key | Action |
|---|---|
| `space` | play / pause |
| `A` / `B` | set loop start / end at the playhead |
| `L` | loop on / off |
| `X` | clear the loop |
| `←` / `→` | back / forward 5 seconds |

You can also drag the A and B flags along the scrub bar while the track plays.

## Where your settings live

Loop points, speed, transpose, notes, and the learned checkbox are saved in
`localStorage`, per song per show. There's no account and no database, so
settings stay on the machine you practise on. The download/upload buttons on the
home page export and restore everything as a JSON file — use that to move
between machines or before clearing site data.
