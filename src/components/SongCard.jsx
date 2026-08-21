import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  FileAudio,
  Music4,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Rewind,
  FastForward,
  X,
  Youtube,
} from 'lucide-react'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { getSongSettings, saveSongSettings } from '../lib/storage'
import { percentLabel, semitoneLabel, timecode } from '../lib/format'
import LoopTimeline from './LoopTimeline'

const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ' +
  'ring-1 ring-edge bg-panel-2 hover:bg-edge transition-colors disabled:opacity-40 ' +
  'disabled:cursor-not-allowed'
const btnOn = 'bg-gold text-ground ring-gold hover:bg-gold/90'

export default function SongCard({ showId, song, index }) {
  const [settings, setSettings] = useState(() => getSongSettings(showId, song.videoId))
  const [mode, setMode] = useState('youtube') // 'youtube' | 'audio'
  const [open, setOpen] = useState(true)
  const cardRef = useRef(null)
  const fileInputRef = useRef(null)

  // The animation-frame loops inside both engines read this ref, so loop edits
  // take effect instantly without re-subscribing anything.
  const loopRef = useRef({
    loopA: settings.loopA,
    loopB: settings.loopB,
    loopOn: settings.loopOn,
  })

  const yt = useYouTubePlayer({ videoId: song.videoId, loopRef })
  const audio = useAudioEngine({ loopRef })

  const engine = mode === 'audio' && audio.ready ? audio : yt
  const { playing, time, duration } = engine

  /** Merge a settings patch, persist it, and keep the loop ref in sync. */
  const update = useCallback(
    (patch) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch }
        loopRef.current = { loopA: next.loopA, loopB: next.loopB, loopOn: next.loopOn }
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

  // Only one engine should ever be making sound.
  useEffect(() => {
    if (mode === 'audio') pauseYouTube()
    else pauseAudio()
  }, [mode, pauseYouTube, pauseAudio])

  const { currentTime: audioTime } = audio
  const { currentTime: youtubeTime } = yt
  const nowAt = useCallback(
    () => (mode === 'audio' ? audioTime() : youtubeTime()),
    [mode, audioTime, youtubeTime]
  )

  const setA = useCallback(() => {
    const t = nowAt()
    // Drop a stale B that now sits before A rather than leaving an inverted loop.
    update({ loopA: t, loopB: settings.loopB != null && settings.loopB > t ? settings.loopB : null })
  }, [nowAt, update, settings.loopB])

  const setB = useCallback(() => {
    const t = nowAt()
    // Setting a valid B arms the loop — that's always what you meant.
    if (settings.loopA != null && t > settings.loopA) update({ loopB: t, loopOn: true })
    else update({ loopB: t })
  }, [nowAt, update, settings.loopA])

  const clearLoop = useCallback(
    () => update({ loopA: null, loopB: null, loopOn: false }),
    [update]
  )

  const toggleLoop = useCallback(() => update({ loopOn: !settings.loopOn }), [update, settings.loopOn])

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
      const handlers = {
        ' ': () => engine.toggle(),
        a: setA,
        b: setB,
        l: toggleLoop,
        x: clearLoop,
        arrowleft: () => engine.nudge(-5),
        arrowright: () => engine.nudge(5),
      }
      const fn = handlers[k === ' ' ? ' ' : k]
      if (fn) {
        e.preventDefault()
        fn()
      }
    },
    [engine, setA, setB, toggleLoop, clearLoop]
  )

  const loopLength = useMemo(
    () =>
      settings.loopA != null && settings.loopB != null
        ? settings.loopB - settings.loopA
        : null,
    [settings.loopA, settings.loopB]
  )

  return (
    <section
      ref={cardRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`rounded-lg bg-panel ring-1 transition-shadow ${
        settings.done ? 'ring-edge/50 opacity-70' : 'ring-edge'
      } focus-within:ring-gold/60`}
    >
      {/* ------------------------------------------------------- header -- */}
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, '0')}</span>

        <button
          onClick={() => update({ done: !settings.done })}
          title={settings.done ? 'Mark as still learning' : 'Mark as learned'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ring-1 ring-edge ${
            settings.done ? 'bg-gold text-ground' : 'bg-panel-2'
          }`}
        >
          {settings.done && <Check size={13} strokeWidth={3} />}
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
        {settings.loopOn && loopLength && (
          <Repeat size={16} className="shrink-0 text-gold" aria-label="Loop active" />
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
              loopA={settings.loopA}
              loopB={settings.loopB}
              loopOn={settings.loopOn}
              onSeek={engine.seek}
              onChangeLoop={update}
            />

            {/* Transport */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button className={btn} onClick={() => engine.nudge(-5)} title="Back 5s (←)">
                <Rewind size={15} />
              </button>
              <button
                className={`${btn} min-w-20 ${playing ? btnOn : ''}`}
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

              <button className={btn} onClick={setA} title="Set loop start here (A)">
                Set A
              </button>
              <button className={btn} onClick={setB} title="Set loop end here (B)">
                Set B
              </button>
              <button
                className={`${btn} ${settings.loopOn ? btnOn : ''}`}
                onClick={toggleLoop}
                disabled={!loopLength || loopLength <= 0}
                title="Toggle loop (L)"
              >
                <Repeat size={15} /> Loop
              </button>
              <button
                className={btn}
                onClick={clearLoop}
                disabled={settings.loopA == null && settings.loopB == null}
                title="Clear loop (X)"
              >
                <RotateCcw size={15} />
              </button>
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

            <p className="text-[11px] leading-relaxed text-muted/70">
              Click the card, then: <b>space</b> play · <b>A</b>/<b>B</b> set loop ·{' '}
              <b>L</b> loop on/off · <b>X</b> clear · <b>←</b>/<b>→</b> ±5s
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
