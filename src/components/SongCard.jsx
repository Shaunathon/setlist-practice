import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileAudio,
  Music4,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  SkipBack,
  FastForward,
  Trash2,
  X,
  Youtube,
} from 'lucide-react'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { useTransposeBridge } from '../hooks/useTransposeBridge'
import { getSongSettings, newLoopId, saveSongSettings } from '../lib/storage'
import { loopLabels, MAX_LOOPS, percentLabel, semitoneLabel } from '../lib/format'
import LoopTimeline from './LoopTimeline'

// The on/off backgrounds are kept apart rather than layered: listing both
// bg-panel-2 and bg-gold on one element lets stylesheet order pick the winner,
// which silently left "armed" buttons with dark text on a dark background.
const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ' +
  'ring-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const btnOff = 'ring-edge bg-panel-2 text-cream hover:bg-edge'
const btnOn = 'ring-gold bg-gold text-ground hover:bg-gold/90'
const btn = `${btnBase} ${btnOff}`

/** Toggle buttons pick exactly one of the two background treatments. */
const toggleBtn = (on) => `${btnBase} ${on ? btnOn : btnOff}`

// Segmented [◂][Set X][▸] group: one ring around the trio rather than three.
const segGroup = 'flex overflow-hidden rounded-md ring-1 ring-edge'
const segBtn =
  'inline-flex items-center justify-center bg-panel-2 text-cream text-sm ' +
  'hover:bg-edge transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

/** How far one nudge moves a loop point, in seconds. */
const NUDGE_SECONDS = 0.1

/**
 * Transposition limit, in semitones either way. A tritone covers any key match
 * you'd actually need — beyond that you're closer to the target by going the
 * other direction — and delay-based shifting degrades badly at wide intervals.
 */
const MAX_PITCH = 6
const clampPitch = (n) => Math.min(MAX_PITCH, Math.max(-MAX_PITCH, Math.round(n)))

/** Minimum playback-loop length the 1/2 button can reach, in seconds. */
const PRACTICE_FLOOR = 0.2

function loopIsComplete(l) {
  return l != null && l.a != null && l.b != null && l.b > l.a
}

export default function SongCard({
  showId,
  song,
  index,
  done,
  onToggleDone,
  onRemove,
  claimPlayback,
  hasFocus,
  onRequestFocus,
}) {
  const [settings, setSettings] = useState(() => getSongSettings(showId, song.videoId))
  const [mode, setMode] = useState('youtube') // 'youtube' | 'audio'
  const [open, setOpen] = useState(true)
  const cardRef = useRef(null)
  const fileInputRef = useRef(null)

  // Placeholder — corrected below once computeLoopRef exists, by the same
  // effect that resets the practice-length adjustment. Kept inert here rather
  // than computed inline so this doesn't have to be defined before duration
  // and practiceLength exist.
  const loopRef = useRef({ loopA: null, loopB: null, loopOn: false })

  const yt = useYouTubePlayer({ videoId: song.videoId, loopRef })
  const audio = useAudioEngine({ loopRef })

  // Clamped on read so a value stored under an older, wider range can't drive
  // the shifter past what it handles well.
  const pitch = clampPitch(settings.pitch)

  // The companion extension, if it's installed, can transpose the YouTube
  // player from inside its own frame.
  const extensionTranspose = useTransposeBridge({
    hostRef: yt.hostRef,
    semitones: pitch,
    enabled: mode === 'youtube',
  })

  const engine = mode === 'audio' && audio.ready ? audio : yt
  // Mirror of the live engine, so click handlers can reach it without taking a
  // dependency on an object that changes identity every render.
  const engineRef = useRef(engine)
  engineRef.current = engine
  const { playing, time, duration } = engine

  // Practice-loop scaling (1/2, x2 in the transport row) is deliberately
  // ephemeral — not saved, not remembered when you switch loops — so it lives
  // as ordinary state, mirrored into refs for the code that needs the latest
  // value without taking it as a dependency (the polling loops, and anything
  // that must read it synchronously inside a setSettings updater).
  const durationRef = useRef(duration)
  durationRef.current = duration

  const [practiceLength, setPracticeLength] = useState(null) // seconds, or null = full loop
  const practiceLengthRef = useRef(null)
  practiceLengthRef.current = practiceLength

  // Mirrored so the focus-loss effect can check whether anything is armed
  // without re-running every time the armed loop changes.
  const activeLoopIdRef = useRef(settings.activeLoopId)
  activeLoopIdRef.current = settings.activeLoopId

  /**
   * Both engines only ever repeat one section, so collapse whichever loop is
   * active down to the flat shape they expect.
   *
   * When no practice adjustment is in effect, the stored bounds pass straight
   * through with no clamping at all — deliberately, so this never depends on
   * `duration` being known yet, which matters on the very first render before
   * the player has reported anything.
   */
  const computeLoopRef = useCallback((s) => {
    const l = s.loops.find((x) => x.id === s.activeLoopId)
    if (!loopIsComplete(l)) return { loopA: null, loopB: null, loopOn: false }

    if (practiceLengthRef.current == null) {
      return { loopA: l.a, loopB: l.b, loopOn: true }
    }

    // The ideal length is never clamped in storage — only the value actually
    // enforced is. That's what lets an over-doubled or over-halved request
    // "remember" where it really was, so an equal number of the opposite
    // button always lands back on the loop's real endpoint, even after
    // bumping into the floor or the end of the track.
    const ideal = practiceLengthRef.current
    const ceiling = durationRef.current ? durationRef.current - l.a : ideal
    const clamped = Math.min(Math.max(ideal, PRACTICE_FLOOR), Math.max(ceiling, PRACTICE_FLOOR))
    return { loopA: l.a, loopB: l.a + clamped, loopOn: true }
  }, [])

  /** Merge a settings patch, persist it, and keep the loop ref in sync. */
  const update = useCallback(
    (patch) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch }
        loopRef.current = computeLoopRef(next)
        saveSongSettings(showId, song.videoId, patch)
        return next
      })
    },
    [showId, song.videoId, computeLoopRef]
  )

  // Restore the saved YouTube rate once the player exists.
  useEffect(() => {
    if (yt.ready && settings.rate !== 1) yt.setRate(settings.rate)
    // Only on first ready — later changes go through the buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yt.ready])

  // Depend on the individual stable callbacks, not the hook's return object —
  // that object is a fresh literal every render, which would re-fire these on
  // each of the 20 playhead updates per second.
  const { ready: audioReady, setTempo, setPitch, pause: pauseAudio } = audio
  const { pause: pauseYouTube } = yt

  useEffect(() => {
    if (audioReady) setTempo(settings.tempo)
  }, [audioReady, setTempo, settings.tempo])

  useEffect(() => {
    if (audioReady) setPitch(pitch)
  }, [audioReady, setPitch, pitch])

  // Only one engine within this card should ever be making sound.
  useEffect(() => {
    if (mode === 'audio') pauseYouTube()
    else pauseAudio()
  }, [mode, pauseYouTube, pauseAudio])

  const pauseEverything = useCallback(() => {
    pauseYouTube()
    pauseAudio()
  }, [pauseYouTube, pauseAudio])

  // …and only one card on the page. This watches the players' own state rather
  // than our Play buttons, so starting a video with YouTube's built-in control
  // still stops whatever else was going.
  useEffect(() => {
    if (yt.playing || audio.playing) claimPlayback?.(song.videoId, pauseEverything)
  }, [yt.playing, audio.playing, claimPlayback, song.videoId, pauseEverything])

  // Step 1: playing pulls focus to this card. Watches the engines' own state,
  // not the Play button, so YouTube's built-in control counts too — clicks
  // inside the cross-origin iframe never reach us as pointer events, so this
  // state watch is the only way that case is caught.
  useEffect(() => {
    if (yt.playing || audio.playing) onRequestFocus?.(song.videoId)
  }, [yt.playing, audio.playing, onRequestFocus, song.videoId])

  // Step 2: losing focus stops this card's playback. Step 3: it also disarms
  // whatever loop was armed here, so coming back and pressing play doesn't drop
  // you straight into a loop you didn't just choose.
  //
  // Tracked as a transition (had it, now don't) rather than plain `!hasFocus`,
  // so a card that never had focus isn't told to pause on every unrelated
  // render. The loop's own A/B points are untouched — only the "currently
  // repeating" flag clears — and `update` skips the write when nothing is armed.
  const hadFocusRef = useRef(hasFocus)
  useEffect(() => {
    const lostFocus = hadFocusRef.current && !hasFocus
    hadFocusRef.current = hasFocus
    if (!lostFocus) return
    pauseYouTube()
    pauseAudio()
    if (activeLoopIdRef.current) update({ activeLoopId: null })
  }, [hasFocus, pauseYouTube, pauseAudio, update])

  const { currentTime: audioTime } = audio
  const { currentTime: youtubeTime } = yt
  const nowAt = useCallback(
    () => (mode === 'audio' ? audioTime() : youtubeTime()),
    [mode, audioTime, youtubeTime]
  )

  /** Move one edge of a section to the playhead. */
  const setPoint = useCallback(
    (loopId, edge) => {
      const t = nowAt()
      setSettings((prev) => {
        const loops = prev.loops.map((l) => {
          if (l.id !== loopId) return l
          // Marking a point on top of its partner would make a section shorter
          // than a single nudge. There's nothing useful to record, so keep the
          // point that's already there rather than wiping it.
          const partner = edge === 'a' ? l.b : l.a
          if (partner != null && Math.abs(partner - t) < NUDGE_SECONDS) return l

          // Otherwise the most recent point wins, and a partner it has
          // invalidated is cleared rather than left backwards.
          if (edge === 'a') {
            return { ...l, a: t, b: l.b != null && l.b > t ? l.b : null }
          }
          return { ...l, b: t, a: l.a != null && l.a < t ? l.a : null }
        })

        const edited = loops.find((l) => l.id === loopId)
        const complete = loopIsComplete(edited)
        // Placing a valid end point means you want to hear that section.
        const activeLoopId = edge === 'b' && complete ? loopId : prev.activeLoopId

        const next = { ...prev, loops, activeLoopId }
        loopRef.current = computeLoopRef(next)
        saveSongSettings(showId, song.videoId, { loops, activeLoopId })
        return next
      })
    },
    [nowAt, showId, song.videoId, computeLoopRef]
  )

  /**
   * Shift one edge of a section by a small step.
   *
   * Moving a start point also takes the playhead there, so you immediately hear
   * whether the section now catches the pickup note. Moving an end point
   * deliberately doesn't — you'd hear that on the loop's next pass anyway, and
   * jumping to the end mid-phrase would be disorienting.
   */
  const nudgePoint = useCallback(
    (loopId, edge, delta) => {
      const loop = settings.loops.find((l) => l.id === loopId)
      const current = loop?.[edge]
      if (current == null) return

      let moved = Math.max(0, current + delta)
      // Keep the edges from crossing, and the end inside the track.
      if (edge === 'a' && loop.b != null) moved = Math.min(moved, loop.b - NUDGE_SECONDS)
      if (edge === 'b') {
        if (loop.a != null) moved = Math.max(moved, loop.a + NUDGE_SECONDS)
        if (duration) moved = Math.min(moved, duration)
      }

      update({
        loops: settings.loops.map((l) => (l.id === loopId ? { ...l, [edge]: moved } : l)),
      })
      if (edge === 'a') engineRef.current?.seek(moved)
    },
    [settings.loops, update, duration]
  )

  /**
   * Arm a section and drop the playhead at its start. Selecting a section is
   * always a request to hear it from the top, whether you got there from the
   * row's Loop button or by clicking the section on the scrub bar.
   *
   * Also always clears any 1/2 / x2 adjustment, even when re-arming the loop
   * that's already active. Clicking a loop's own region on the timeline is
   * exactly that case — activeLoopId doesn't change, so the effect that
   * clears the adjustment on a *different* armed loop never fires; this is
   * the only path re-clicking the same region goes through.
   */
  const armLoop = useCallback(
    (loopId) => {
      const loop = settings.loops.find((l) => l.id === loopId)
      if (!loop) return
      practiceLengthRef.current = null
      setPracticeLength(null)
      update({ activeLoopId: loopId })
      if (loop.a != null) engineRef.current?.seek(loop.a)
      // Selecting a section is a request to hear it, whichever way you got
      // here — the row's Loop button or clicking the section on the scrub bar.
      // Both routes come through here so they can't drift apart.
      engineRef.current?.play()
    },
    [update, settings.loops]
  )

  /**
   * Only one section repeats at a time — arming one disarms the rest.
   *
   * Arming starts playback from the section's start — that lives in `armLoop`,
   * shared with scrub-bar clicks so both behave the same.
   *
   * Turning a loop off only applies on a card that actually holds focus. An
   * unfocused card isn't repeating anything you can hear — its armed flag is
   * just stale state, most often restored from storage on page load — so a
   * click there always means "start this section", never "switch it off".
   * Without that guard, the very first click on a saved-armed loop would
   * silently disarm it instead of playing it.
   */
  const toggleLoop = useCallback(
    (loopId) => {
      if (hasFocus && settings.activeLoopId === loopId) {
        update({ activeLoopId: null })
        return
      }
      armLoop(loopId)
    },
    [hasFocus, settings.activeLoopId, update, armLoop]
  )

  /**
   * Restart the armed section from the top, or the track if nothing is armed.
   * Deliberately doesn't disarm — unlike a scrub-bar seek, this is a request to
   * hear the section again, not to leave it.
   */
  const toSectionStart = useCallback(() => {
    const loop = settings.loops.find((l) => l.id === settings.activeLoopId)
    engineRef.current?.seek(loop?.a != null ? loop.a : 0)
  }, [settings.loops, settings.activeLoopId])

  /**
   * Seeking anywhere that isn't a section releases the armed one, so the song
   * plays on from exactly where you clicked instead of being yanked back.
   */
  const seekOutside = useCallback(
    (seconds) => {
      setSettings((prev) => {
        if (!prev.activeLoopId) return prev // already free — no write, no re-render
        const next = { ...prev, activeLoopId: null }
        loopRef.current = computeLoopRef(next)
        saveSongSettings(showId, song.videoId, { activeLoopId: null })
        return next
      })
      engineRef.current?.seek(seconds)
    },
    [showId, song.videoId, computeLoopRef]
  )

  /**
   * Start a section and mark the point in one go. Pressing A on a song with no
   * sections has to record where you are, not just make an empty row — the row
   * is a means to the point, never the goal.
   */
  const startSectionAt = useCallback(
    (edge) => {
      if (settings.loops.length >= MAX_LOOPS) return
      const t = nowAt()
      const loop = { id: newLoopId(), a: edge === 'a' ? t : null, b: edge === 'b' ? t : null }
      update({ loops: [...settings.loops, loop] })
    },
    [nowAt, update, settings.loops]
  )

  const addLoop = useCallback(() => {
    if (settings.loops.length >= MAX_LOOPS) return
    // Not armed on creation — it has no points yet, so there'd be nothing to
    // repeat, and silently stopping the running loop would be surprising.
    update({ loops: [...settings.loops, { id: newLoopId(), a: null, b: null }] })
  }, [update, settings.loops])

  const deleteLoop = useCallback(
    (loopId) =>
      update({
        loops: settings.loops.filter((l) => l.id !== loopId),
        activeLoopId: settings.activeLoopId === loopId ? null : settings.activeLoopId,
      }),
    [update, settings.loops, settings.activeLoopId]
  )

  const activeLoop = useMemo(
    () => settings.loops.find((l) => l.id === settings.activeLoopId) || null,
    [settings.loops, settings.activeLoopId]
  )

  // Whenever a different section is armed, or the armed one's own points move,
  // a stale scaling factor wouldn't mean anything against the new bounds — so
  // drop back to the full loop. This also does the one-time job of syncing
  // loopRef from the inert placeholder it starts with.
  useEffect(() => {
    practiceLengthRef.current = null
    setPracticeLength(null)
    loopRef.current = computeLoopRef(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.activeLoopId, activeLoop?.a, activeLoop?.b])

  const activeLoopComplete = loopIsComplete(activeLoop)
  const naturalLength = activeLoopComplete ? activeLoop.b - activeLoop.a : null
  const practiceCeiling = activeLoopComplete && duration ? duration - activeLoop.a : null

  // The displayed/enforced length clamps; the stored `practiceLength` itself
  // never does, which is what lets an over-doubled or over-halved request find
  // its way back exactly to the original once enough opposite presses land.
  const displayLength =
    practiceLength == null
      ? naturalLength
      : naturalLength == null
        ? null
        : Math.min(
            Math.max(practiceLength, PRACTICE_FLOOR),
            Math.max(practiceCeiling ?? practiceLength, PRACTICE_FLOOR)
          )

  const canHalve = displayLength != null && displayLength > PRACTICE_FLOOR + 1e-9
  const canDouble =
    displayLength != null && practiceCeiling != null && displayLength < practiceCeiling - 1e-9
  const showPracticeAdjustment =
    displayLength != null && naturalLength != null && Math.abs(displayLength - naturalLength) > 1e-6
  const practiceEnd = showPracticeAdjustment ? activeLoop.a + displayLength : null

  const halvePracticeLength = useCallback(() => {
    if (!activeLoopComplete) return
    const current = practiceLengthRef.current ?? naturalLength
    const next = current / 2
    practiceLengthRef.current = next
    setPracticeLength(next)
    loopRef.current = computeLoopRef(settings)
  }, [activeLoopComplete, naturalLength, settings, computeLoopRef])

  const doublePracticeLength = useCallback(() => {
    if (!activeLoopComplete) return
    const current = practiceLengthRef.current ?? naturalLength
    const next = current * 2
    practiceLengthRef.current = next
    setPracticeLength(next)
    loopRef.current = computeLoopRef(settings)
  }, [activeLoopComplete, naturalLength, settings, computeLoopRef])

  const resetPracticeLength = useCallback(() => {
    practiceLengthRef.current = null
    setPracticeLength(null)
    loopRef.current = computeLoopRef(settings)
  }, [settings, computeLoopRef])

  const handleFile = useCallback(
    async (file) => {
      if (!file) return
      await audio.load(file)
      setMode('audio')
    },
    [audio]
  )

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      handleFile(e.dataTransfer.files?.[0])
    },
    [handleFile]
  )

  /* --------------------------------------------------------- shortcuts -- */
  const onKeyDown = useCallback(
    (e) => {
      // Never hijack typing in the notes field.
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      const k = e.key.toLowerCase()

      // Shortcuts act on the armed section, falling back to the last row so
      // they still do something sensible when nothing is looping yet.
      const targetId =
        settings.activeLoopId ?? settings.loops[settings.loops.length - 1]?.id ?? null

      // Arrows do three different jobs depending on the modifier: bare is
      // ordinary scrubbing, shift trims the section's start, alt trims its end.
      if (k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault()
        const direction = k === 'arrowleft' ? -1 : 1
        // Trimming keys follow the armed section only, matching the buttons —
        // never the last-row fallback, or they'd edit a section whose own
        // arrows are greyed out.
        const armed = settings.activeLoopId
        if (e.shiftKey && armed) nudgePoint(armed, 'a', direction * NUDGE_SECONDS)
        else if (e.altKey && armed) nudgePoint(armed, 'b', direction * NUDGE_SECONDS)
        else if (!e.shiftKey && !e.altKey) engine.nudge(direction * 5)
        return
      }

      // A and D rather than A and B: they sit under the same two fingers, so
      // you can mark both ends without looking down.
      const handlers = {
        ' ': () => engine.toggle(),
        a: () => (targetId ? setPoint(targetId, 'a') : startSectionAt('a')),
        d: () => targetId && setPoint(targetId, 'b'),
        l: () => targetId && toggleLoop(targetId),
      }
      const fn = handlers[k === ' ' ? ' ' : k]
      if (fn) {
        e.preventDefault()
        fn()
      }
    },
    [engine, setPoint, toggleLoop, addLoop, nudgePoint, settings.activeLoopId, settings.loops]
  )

  return (
    <section
      ref={cardRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      // Any interaction with this card claims focus — a click on the scrub bar,
      // a Set button, the notes field, anywhere. Nothing in the card stops
      // propagation, so this one handler covers all of it. Re-claiming focus
      // this card already holds is a no-op React bails out of.
      onPointerDown={() => onRequestFocus?.(song.videoId)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      // The gold ring means exactly one thing — this card holds playback focus —
      // at one brightness. There used to be a `focus-within:ring-gold/60` here
      // too, from before an explicit focus concept existed; with both present,
      // whichever descendant happened to hold DOM focus decided the ring colour,
      // so the same "focused" state rendered at two different opacities.
      className={`rounded-lg bg-panel ring-1 transition-shadow ${
        hasFocus ? 'ring-2 ring-gold' : done ? 'ring-edge/50 opacity-70' : 'ring-edge'
      }`}
    >
      {/* ------------------------------------------------------- header -- */}
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, '0')}</span>

        <button
          onClick={onToggleDone}
          aria-pressed={done}
          aria-label={done ? `Mark "${song.title}" as still learning` : `Mark "${song.title}" as learned`}
          title={done ? 'Learned — click to mark as still learning' : 'Mark as learned'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ring-1 ring-edge ${
            done ? 'bg-gold text-ground' : 'bg-panel-2'
          }`}
        >
          {done && <Check size={13} strokeWidth={3} />}
        </button>

        <h3 className="min-w-0 flex-1 truncate text-lg" title={song.title}>
          {song.title}
        </h3>

        {mode === 'youtube' && (settings.rate !== 1 || (extensionTranspose && pitch !== 0)) && (
          <span className="rounded bg-gold/20 px-1.5 py-0.5 font-mono text-xs text-gold">
            {settings.rate !== 1 && percentLabel(settings.rate)}
            {settings.rate !== 1 && extensionTranspose && pitch !== 0 && ' · '}
            {extensionTranspose && pitch !== 0 && `${semitoneLabel(pitch)} semis`}
          </span>
        )}
        {mode === 'audio' && (
          <span className="rounded bg-rust/25 px-1.5 py-0.5 font-mono text-xs text-cream">
            {percentLabel(settings.tempo)} · {semitoneLabel(pitch)}
          </span>
        )}
        {activeLoop && activeLoop.a != null && activeLoop.b != null && (
          <Repeat
            size={16}
            className="shrink-0 text-gold"
            aria-label={`Looping section ${loopLabels(settings.loops.indexOf(activeLoop))[0]}`}
          />
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse' : 'Expand'}
          className="shrink-0 rounded p-1 text-muted hover:bg-panel-2 hover:text-cream"
        >
          <ChevronDown size={18} className={open ? '' : '-rotate-90'} />
        </button>
      </header>

      {open && (
        <div className="grid gap-4 border-t border-edge p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* ----------------------------------------------------- video -- */}
          <div>
            <div className="aspect-video w-full overflow-hidden rounded-md bg-black ring-1 ring-edge">
              <div ref={yt.hostRef} className="h-full w-full" />
            </div>

            {/* Source switch */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex overflow-hidden rounded-md ring-1 ring-edge">
                <button
                  onClick={() => setMode('youtube')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${
                    mode === 'youtube' ? 'bg-gold text-ground' : 'bg-panel-2 hover:bg-edge'
                  }`}
                >
                  <Youtube size={13} /> YouTube
                </button>
                <button
                  onClick={() => (audio.ready ? setMode('audio') : fileInputRef.current?.click())}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${
                    mode === 'audio' ? 'bg-rust text-cream' : 'bg-panel-2 hover:bg-edge'
                  }`}
                >
                  <FileAudio size={13} /> Audio file
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.flac,.aac,.ogg"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />

              {audio.ready ? (
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  <Music4 size={12} className="shrink-0" />
                  <span className="truncate" title={audio.fileName}>
                    {audio.fileName}
                  </span>
                  <button
                    onClick={() => {
                      audio.teardown()
                      setMode('youtube')
                    }}
                    className="shrink-0 rounded p-0.5 hover:bg-panel-2 hover:text-cream"
                    aria-label="Remove audio file"
                  >
                    <X size={12} />
                  </button>
                </span>
              ) : (
                <span className="text-xs text-muted">
                  {audio.loading ? 'Decoding…' : 'Drop a file here to unlock transpose'}
                </span>
              )}
            </div>

            {audio.error && <p className="mt-1.5 text-xs text-rust">{audio.error}</p>}
          </div>

          {/* -------------------------------------------------- controls -- */}
          <div className="flex flex-col gap-3">
            <LoopTimeline
              duration={duration}
              time={time}
              loops={settings.loops}
              activeLoopId={settings.activeLoopId}
              practiceEnd={practiceEnd}
              onSeek={seekOutside}
              onJumpToLoop={armLoop}
            />

            {/* Player controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={btn}
                onClick={toSectionStart}
                title={
                  activeLoop?.a != null
                    ? 'Back to the start of the armed section'
                    : 'Back to the start of the track'
                }
                aria-label={
                  activeLoop?.a != null
                    ? 'Back to the start of the armed section'
                    : 'Back to the start of the track'
                }
              >
                <SkipBack size={15} />
              </button>
              <button
                className={`${toggleBtn(playing)} min-w-20`}
                onClick={engine.toggle}
                title="Play / pause (space)"
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <button className={btn} onClick={() => engine.nudge(5)} title="Forward 5s (→)">
                <FastForward size={15} />
              </button>

              <span className="mx-1 h-5 w-px bg-edge" />

              <button
                className={btn}
                onClick={halvePracticeLength}
                disabled={!canHalve}
                title="Halve the playback loop's length (doesn't change its set points)"
              >
                1/2
              </button>
              <button
                className={btn}
                onClick={doublePracticeLength}
                disabled={!canDouble}
                title="Double the playback loop's length (doesn't change its set points)"
              >
                x2
              </button>
              {showPracticeAdjustment && (
                <button
                  className={btn}
                  onClick={resetPracticeLength}
                  title="Return to the full loop"
                  aria-label="Return playback to the full loop"
                >
                  <RotateCcw size={15} />
                </button>
              )}
            </div>

            {/* Looper rows — one section per row, lettered by position */}
            <div className="flex flex-col gap-1.5">
              {settings.loops.map((loop, i) => {
                const [labelA, labelB] = loopLabels(i)
                const isActive = loop.id === settings.activeLoopId
                const complete = loopIsComplete(loop)

                return (
                  <div key={loop.id} className="flex flex-wrap items-center gap-1.5">
                    {/* The arrow's position is the selection — there's no
                        "pick an endpoint first" step to get wrong. */}
                    {[
                      { edge: 'a', label: labelA, word: 'start' },
                      { edge: 'b', label: labelB, word: 'end' },
                    ].map(({ edge, label, word }) => (
                      <div key={edge} className={segGroup}>
                        <button
                          className={`${segBtn} px-1.5`}
                          onClick={() => nudgePoint(loop.id, edge, -NUDGE_SECONDS)}
                          // Trimming only ever applies to the section you're
                          // listening to, so the rest stay inert.
                          disabled={loop[edge] == null || !isActive}
                          title={
                            !isActive
                              ? 'Arm this section to trim it'
                              : `Move ${label} back 100ms`
                          }
                          aria-label={`Move section ${label} ${word} back 100 milliseconds`}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          className={`${segBtn} border-x border-edge px-2.5 py-1.5`}
                          onClick={() => setPoint(loop.id, edge)}
                          title={`Set ${label} ${word} at the playhead`}
                        >
                          Set {label}
                        </button>
                        <button
                          className={`${segBtn} px-1.5`}
                          onClick={() => nudgePoint(loop.id, edge, NUDGE_SECONDS)}
                          disabled={loop[edge] == null || !isActive}
                          title={
                            !isActive
                              ? 'Arm this section to trim it'
                              : `Move ${label} forward 100ms`
                          }
                          aria-label={`Move section ${label} ${word} forward 100 milliseconds`}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      className={toggleBtn(isActive)}
                      onClick={() => toggleLoop(loop.id)}
                      disabled={!complete}
                      title={
                        complete
                          ? `Repeat ${labelA}–${labelB}`
                          : `Set both ${labelA} and ${labelB} first`
                      }
                    >
                      <Repeat size={15} /> Loop
                    </button>
                    <button
                      className={btn}
                      onClick={() => deleteLoop(loop.id)}
                      title={`Delete section ${labelA}–${labelB}`}
                      aria-label={`Delete section ${labelA}–${labelB}`}
                    >
                      <X size={15} />
                    </button>
                    {complete && (
                      <span className="font-mono text-xs text-muted">
                        {(loop.b - loop.a).toFixed(1)}s
                      </span>
                    )}
                  </div>
                )
              })}

              <div>
                <button
                  className={btn}
                  onClick={addLoop}
                  disabled={settings.loops.length >= MAX_LOOPS}
                  title={
                    settings.loops.length >= MAX_LOOPS
                      ? `That's the limit of ${MAX_LOOPS} sections`
                      : 'Add another loop section'
                  }
                >
                  <Plus size={15} />
                  {settings.loops.length === 0 ? 'Add a loop section' : ''}
                </button>
              </div>
            </div>

            {/* Speed */}
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <label className="text-xs uppercase tracking-wide text-muted">Speed</label>
                <span className="font-mono text-sm text-gold">
                  {percentLabel(mode === 'audio' ? settings.tempo : settings.rate)}
                </span>
              </div>

              {mode === 'audio' ? (
                <>
                  <input
                    type="range"
                    min="0.25"
                    max="2"
                    step="0.01"
                    value={settings.tempo}
                    onChange={(e) => update({ tempo: Number(e.target.value) })}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-1">
                    {[0.5, 0.65, 0.75, 0.85, 1].map((t) => (
                      <button
                        key={t}
                        onClick={() => update({ tempo: t })}
                        className="flex-1 rounded bg-panel-2 py-0.5 text-xs ring-1 ring-edge hover:bg-edge"
                      >
                        {percentLabel(t)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {yt.rates.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        yt.setRate(r)
                        update({ rate: r })
                      }}
                      className={`rounded px-2 py-1 font-mono text-xs ring-1 ring-edge ${
                        settings.rate === r ? 'bg-gold text-ground' : 'bg-panel-2 hover:bg-edge'
                      }`}
                    >
                      {percentLabel(r)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pitch */}
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <label className="text-xs uppercase tracking-wide text-muted">Transpose</label>
                <span className="font-mono text-sm text-gold">
                  {mode === 'audio' || extensionTranspose
                    ? `${semitoneLabel(pitch)} semis`
                    : '—'}
                </span>
              </div>

              {mode === 'audio' || extensionTranspose ? (
                <>
                  <input
                    type="range"
                    min={-MAX_PITCH}
                    max={MAX_PITCH}
                    step="1"
                    value={pitch}
                    onChange={(e) => update({ pitch: clampPitch(Number(e.target.value)) })}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-1">
                    {/* Relative steps either side of an absolute reset, so you
                        can chase a key by ear without doing the sums. */}
                    {[
                      { label: '−2', delta: -2 },
                      { label: '−1', delta: -1 },
                      { label: '0', reset: true },
                      { label: '+1', delta: 1 },
                      { label: '+2', delta: 2 },
                    ].map(({ label, delta, reset }) => {
                      const next = reset ? 0 : clampPitch(pitch + delta)
                      return (
                        <button
                          key={label}
                          onClick={() => update({ pitch: next })}
                          disabled={next === pitch}
                          title={
                            reset
                              ? 'Back to the original key'
                              : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} semitone${
                                  Math.abs(delta) === 1 ? '' : 's'
                                }`
                          }
                          className="flex-1 rounded bg-panel-2 py-0.5 font-mono text-xs ring-1 ring-edge hover:bg-edge disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="rounded bg-panel-2 px-2 py-1.5 text-xs leading-relaxed text-muted">
                  A web page can't reach the audio inside a cross-origin YouTube
                  frame. Install the companion extension from{' '}
                  <code className="rounded bg-ground px-1 py-0.5">extension/</code> to
                  transpose the video, or attach an audio file.
                </p>
              )}
            </div>

            <textarea
              value={settings.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Notes — key, tricky bars, who takes the solo…"
              rows={2}
              className="w-full resize-y rounded-md bg-panel-2 px-2.5 py-1.5 text-sm ring-1 ring-edge placeholder:text-muted/60"
            />

            <div className="flex items-end justify-between gap-3">
              <p className="text-[11px] leading-relaxed text-muted/70">
                Click the card, then: <b>space</b> play · <b>A</b>/<b>D</b> mark the armed
                section · <b>L</b> loop on/off · <b>←</b>/<b>→</b> ±5s ·{' '}
                <b>shift</b>/<b>alt</b>+<b>←→</b> nudge start/end 100ms
              </p>
              <button
                onClick={onRemove}
                title="Remove this video from the practice list (Refresh brings it back)"
                aria-label={`Remove "${song.title}" from this practice list`}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted ring-1 ring-edge hover:bg-panel-2 hover:text-rust"
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
