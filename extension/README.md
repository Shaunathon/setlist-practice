# Setlist Practice — Transpose extension

Adds real pitch shifting to the YouTube players inside Setlist Practice.

## Why this has to be an extension

A web page cannot touch the audio inside a cross-origin iframe. The YouTube
player is served from `youtube.com`; the app is served from somewhere else, and
the browser's same-origin policy sits between them. That boundary is what stops
any random site from reading an embedded bank widget, so it isn't going to be
relaxed, and no amount of work on the app can get around it.

A content script is different: Chrome runs it *as part of* the frame's own
origin. From in there the `<video>` element and its audio are ordinary
same-origin objects, so they can be routed through Web Audio and shifted. That's
the only difference between this and the app — not capability, permission.

## Installing

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `extension/` folder
4. Reload the practice app

The Transpose slider on each song card becomes active once the extension
answers. If it stays greyed out, the extension isn't loaded — reload the page
after installing.

Chrome will occasionally warn about developer-mode extensions. That's expected
for something loaded unpacked rather than from the Web Store.

## What it does and doesn't touch

The content script matches `youtube.com/embed/*` only, and stays completely
inert until a parent page speaks its message protocol. YouTube embeds on other
sites, and youtube.com itself, are unaffected.

It never sends anything anywhere — no network calls, no storage. It receives a
number of semitones and reroutes audio locally.

## About the sound

Pitch shifting a live stream means processing audio you can't see ahead of, so
it's done with delay-line modulation ("Jungle"): two delay lines whose delay
times ramp linearly create a constant Doppler shift, crossfaded to hide the
reset. This is the same class of technique the published pitch-shifting
extensions use.

Expect it to sound clean around ±1–3 semitones, which covers matching a band's
key, and progressively more warbly beyond that. Shifting a whole octave will
sound rough. That's inherent to real-time shifting, not a bug to report.

For better quality on a tune you're seriously drilling, attach a local audio
file to the song card instead. That path decodes the whole file up front and
uses SoundTouch, which sounds considerably better because it isn't racing
playback.

## If it stops working

The script looks for a `<video>` element inside the embed. If YouTube
restructures its embed player this may need adjusting. Nothing else here depends
on YouTube's internals.

## A note on the depth calculation

The delay ramp sweeps from 0 to `depth` over `BUFFER_TIME`, and a linearly
ramping delay shifts pitch by `1 + depth / BUFFER_TIME`. Since `DELAY_TIME` and
`BUFFER_TIME` are both 0.1, the depth must be passed through in full for the
result to land on `2^(semitones/12)`.

The widely copied version of this algorithm halves it (`0.5 * delayTime`). That
delivers half the requested interval — a semitone arrives as 51 cents, near
enough a quarter tone to be immediately obvious to anyone with ears. If pitches
ever start sounding flat by half an interval, this is the line to check.
