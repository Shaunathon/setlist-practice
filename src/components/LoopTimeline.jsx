import { useCallback, useRef } from 'react'
import { timecode } from '../lib/format'

/**
 * Scrub bar with a draggable A–B loop region.
 *
 * Click anywhere to seek. Drag the A or B flag to reshape the loop while the
 * track keeps playing, which is how you actually dial in a tricky bar.
 */
export default function LoopTimeline({
  duration,
  time,
  loopA,
  loopB,
  loopOn,
  onSeek,
  onChangeLoop,
}) {
  const trackRef = useRef(null)
  const dragRef = useRef(null) // 'A' | 'B' | 'seek'

  const positionFromEvent = useCallback(
    (clientX) => {
      const el = trackRef.current
      if (!el || !duration) return 0
      const rect = el.getBoundingClientRect()
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
      return ratio * duration
    },
    [duration]
  )

  const handlePointerDown = (which) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = which
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const handleTrackPointerDown = (e) => {
    if (!duration) return
    dragRef.current = 'seek'
    trackRef.current.setPointerCapture?.(e.pointerId)
    onSeek(positionFromEvent(e.clientX))
  }

  const handlePointerMove = (e) => {
    const which = dragRef.current
    if (!which || !duration) return
    const pos = positionFromEvent(e.clientX)

    if (which === 'seek') {
      onSeek(pos)
    } else if (which === 'A') {
      // Never let A cross B — clamp to just under it.
      onChangeLoop({ loopA: loopB != null ? Math.min(pos, loopB - 0.1) : pos })
    } else if (which === 'B') {
      onChangeLoop({ loopB: loopA != null ? Math.max(pos, loopA + 0.1) : pos })
    }
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const pct = (v) => (duration ? `${Math.min(Math.max((v / duration) * 100, 0), 100)}%` : '0%')
  const hasLoop = loopA != null && loopB != null && loopB > loopA

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-10 cursor-pointer rounded-md bg-panel-2 ring-1 ring-edge"
        role="slider"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={time || 0}
        aria-valuetext={timecode(time)}
        tabIndex={-1}
      >
        {/* Loop region */}
        {hasLoop && (
          <div
            className={`absolute inset-y-0 ${loopOn ? 'bg-gold/25' : 'bg-muted/15'}`}
            style={{ left: pct(loopA), width: pct(loopB - loopA) }}
          />
        )}

        {/* Elapsed shading */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-cream/5"
          style={{ width: pct(time) }}
        />

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-cream"
          style={{ left: pct(time) }}
        />

        {/* A handle */}
        {loopA != null && (
          <button
            onPointerDown={handlePointerDown('A')}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            aria-label={`Loop start at ${timecode(loopA, true)} — drag to move`}
            className="absolute top-0 z-10 -ml-2 flex h-full w-4 cursor-ew-resize items-start justify-center"
            style={{ left: pct(loopA) }}
          >
            <span className="rounded-br rounded-tl bg-gold px-1 text-[10px] font-bold leading-4 text-ground">
              A
            </span>
          </button>
        )}

        {/* B handle */}
        {loopB != null && (
          <button
            onPointerDown={handlePointerDown('B')}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            aria-label={`Loop end at ${timecode(loopB, true)} — drag to move`}
            className="absolute top-0 z-10 -ml-2 flex h-full w-4 cursor-ew-resize items-end justify-center"
            style={{ left: pct(loopB) }}
          >
            <span className="rounded-bl rounded-tr bg-rust px-1 text-[10px] font-bold leading-4 text-cream">
              B
            </span>
          </button>
        )}
      </div>

      <div className="mt-1 flex justify-between font-mono text-xs text-muted">
        <span>{timecode(time)}</span>
        {hasLoop && (
          <span className={loopOn ? 'text-gold' : ''}>
            loop {timecode(loopA, true)} → {timecode(loopB, true)} (
            {(loopB - loopA).toFixed(1)}s)
          </span>
        )}
        <span>{timecode(duration)}</span>
      </div>
    </div>
  )
}
