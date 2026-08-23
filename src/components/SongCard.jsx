import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  FileAudio,
  Music4,
  Pause,
  Play,
  Plus,
  Repeat,
  Rewind,
  FastForward,
  Trash2,
  X,
  Youtube,
} from 'lucide-react'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useAudioEngine } from '../hooks/useAudioEngine'
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

export default function SongCard({
  showId,
  song,
  index,
  done,
  onToggleDone,
  onRemove,
  claimPlayback,
}) {
  const [settings, setSettings] = useState(() => getSongSettings(showId, song.videoId))
  const [mode, setMode] = useState('youtube') // 'youtube' | 'audio'
  const [open, setOpen] = useState(true)
  const cardRef = useRef(null)
  const fileInputRef = useRef(null)

  // Both engines only ever repeat one section, so collapse whichever loop is
  // active down to the flat shape they expect. An incomplete section (only one
  // point placed) simply doesn't loop.
  const activeLoopFor = (s) => {
    const l = s.loops.find((x) => x.id === s.activeLoopId)
    return l && l.a != null && l.b != null && l.b > l.a
      ? { loopA: l.a, loopB: l.b, loopOn: true }
      : { loopA: null, loopB: null, loopOn: false }
  }

  // The polling loops inside both engines read this ref, so loop edits take
  // effect instantly without re-subscribing anything.
  const loopRef = useRef(activeLoopFor(settings))

  const yt = useYouTubePlayer({ videoId: song.videoId, loopRef })
  const audio = useAudioEngine({ loopRef })

  const engine = mode === 'audio' && audio.ready ? audio : yt
  // Mirror of the live engine, so click handlers can reach it without taking a
  // dependency on an object that changes identity every render.
  const engineRef = useRef(engine)
  engineRef.current = engine
  const { playing, time, duration } = engine

  /** Merge a settings patch, persist it, and keep the loop ref in sync. */
  const update = useCallback(
    (patch) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch }
        loopRef.current = activeLoopFor(next)
        saveSongSettings(showId, song.videoId, patch)
        return next
      })
    },
    [showId, song.videoId]
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
    if (audioReady) setPitch(settings.pitch)
  }, [audioReady, setPitch, settings.pitch])

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
          if (edge === 'a') {
            // Drop a stale end that now sits before the new start.
            return { ...l, a: t, b: l.b != null && l.b > t ? l.b : null }
          }
          return { ...l, b: t }
        })

        const edited = loops.find((l) => l.id === loopId)
        const complete = edited && edited.a != null && edited.b != null && edited.b > edited.a
        // Placing a valid end point means you want to hear that section.
        const activeLoopId = edge === 'b' && complete ? loopId : prev.activeLoopId

        const next = { ...prev, loops, activeLoopId }
        loopRef.current = activeLoopFor(next)
        saveSongSettings(showId, song.videoId, { loops, activeLoopId })
        return next
      })
    },
    [nowAt, showId, song.videoId]
  )

  /**
   * Arm a section and drop the playhead at its start. Selecting a section is
   * always a request to hear it from the top, whether you got there from the
   * row's Loop button or by clicking the section on the scrub bar.
   */
  const armLoop = useCallback(
    (loopId) => {
      const loop = settings.loops.find((l) => l.id === loopId)
      if (!loop) return
      update({ activeLoopId: loopId })
      if (loop.a != null) engineRef.current?.seek(loop.a)
    },
    [update, settings.loops]
  )

  /** Only one section repeats at a time — arming one disarms the rest. */
  const toggleLoop = useCallback(
    (loopId) => {
      if (settings.activeLoopId === loopId) update({ activeLoopId: null })
      else armLoop(loopId)
    },
    [settings.activeLoopId, update, armLoop]
  )

  /**
   * Seeking anywhere that isn't a section releases the armed one, so the song
   * plays on from exactly where you clicked instead of being yanked back.
   */
  const seekOutside = useCallback(
    (seconds) => {
      setSettings((prev) => {
        if (!prev.activeLoopId) return prev // already free — no write, no re-render
        const next = { ...prev, activeLoopId: null }
        loopRef.current = activeLoopFor(next)
        saveSongSettings(showId, song.videoId, { activeLoopId: null })
        return next
      })
      engineRef.current?.seek(seconds)
    },
    [showId, song.videoId]
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

      const handlers = {
        ' ': () => engine.toggle(),
        a: () => (targetId ? setPoint(targetId, 'a') : addLoop()),
        b: () => targetId && setPoint(targetId, 'b'),
        l: () => targetId && toggleLoop(targetId),
        arrowleft: () => engine.nudge(-5),
        arrowright: () => engine.nudge(5),
      }
      const fn = handlers[k === ' ' ? ' ' : k]
      if (fn) {
        e.preventDefault()
        fn()
      }
    },
    [engine, setPoint, toggleLoop, addLoop, settings.activeLoopId, settings.loops]
  )

  const activeLoop = useMemo(
    () => settings.loops.find((l) => l.id === settings.activeLoopId) || null,
    [settings.loops, settings.activeLoopId]
  )

  return (
    <section
      ref={cardRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`rounded-lg bg-panel ring-1 transition-shadow ${
        done ? 'ring-edge/50 opacity-70' : 'ring-edge'
      } focus-within:ring-gold/60`}
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

        {settings.rate !== 1 && mode === 'youtube' && (
          <span className="rounded bg-gold/20 px-1.5 py-0.5 font-mono text-xs text-gold">
            {percentLabel(settings.rate)}
          </span>
        )}
        {mode === 'audio' && (
          <span className="rounded bg-rust/25 px-1.5 py-0.5 font-mono text-xs text-cream">
            {percentLabel(settings.tempo)} · {semitoneLabel(settings.pitch)}
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
              onSeek={seekOutside}
              onJumpToLoop={armLoop}
            />

            {/* Player controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button className={btn} onClick={() => engine.nudge(-5)} title="Back 5s (←)">
                <Rewind size={15} />
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
            </div>

            {/* Looper rows — one section per row, lettered by position */}
            <div className="flex flex-col gap-1.5">
              {settings.loops.map((loop, i) => {
                const [labelA, labelB] = loopLabels(i)
                const isActive = loop.id === settings.activeLoopId
                const complete = loop.a != null && loop.b != null && loop.b > loop.a

                return (
                  <div key={loop.id} className="flex flex-wrap items-center gap-1.5">
                    <button
                      className={btn}
                      onClick={() => setPoint(loop.id, 'a')}
                      title={`Set section ${labelA} start at the playhead`}
                    >
                      Set {labelA}
                    </button>
                    <button
                      className={btn}
                      onClick={() => setPoint(loop.id, 'b')}
                      title={`Set section ${labelB} end at the playhead`}
                    >
                      Set {labelB}
                    </button>
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
                  {mode === 'audio' ? `${semitoneLabel(settings.pitch)} st` : '—'}
                </span>
              </div>

              {mode === 'audio' ? (
                <>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={settings.pitch}
                    onChange={(e) => update({ pitch: Number(e.target.value) })}
                    className="w-full"
                  />
                  <div className="mt-1 flex gap-1">
                    {[-5, -2, 0, 2, 5].map((p) => (
                      <button
                        key={p}
                        onClick={() => update({ pitch: p })}
                        className="flex-1 rounded bg-panel-2 py-0.5 font-mono text-xs ring-1 ring-edge hover:bg-edge"
                      >
                        {semitoneLabel(p)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="rounded bg-panel-2 px-2 py-1.5 text-xs leading-relaxed text-muted">
                  YouTube's player exposes no pitch control, and its audio is
                  locked inside a cross-origin frame. Attach an audio file to
                  transpose this one.
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
                Click the card, then: <b>space</b> play · <b>A</b>/<b>B</b> set the armed
                section · <b>L</b> loop on/off · <b>←</b>/<b>→</b> ±5s
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
