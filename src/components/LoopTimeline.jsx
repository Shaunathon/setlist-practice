import { useCallback, useRef } from 'react'
import { loopLabels, timecode } from '../lib/format'

/**
 * Scrub bar showing every loop section at once.
 *
 * Clicking inside a section jumps to that section's start — not the pixel you
 * clicked — and makes it the active loop, which is the quick way to move
 * between sections. Clicking anywhere else is an ordinary seek. The A/B flags
 * stay draggable so you can reshape a section while it plays.
 */
export default function LoopTimeline({
  duration,
  time,
  loops,
  activeLoopId,
  onSeek,
  onJumpToLoop,
  onChangeLoop,
}) {
  const trackRef = useRef(null)
  const dragRef = useRef(null) // { loopId, edge: 'a' | 'b' } | 'seek'

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

  const complete = (l) => l.a != null && l.b != null && l.b > l.a

  const handleTrackPointerDown = (e) => {
    if (!duration) return
    const pos = positionFromEvent(e.clientX)

    // Landing inside a section means "take me to this loop", not "seek here".
    const hit = loops.find((l) => complete(l) && pos >= l.a && pos <= l.b)
    if (hit) {
      onJumpToLoop(hit.id)
      return
    }

    dragRef.current = 'seek'
    trackRef.current.setPointerCapture?.(e.pointerId)
    onSeek(pos)
  }

  const handlePointerMove = (e) => {
    const drag = dragRef.current
    if (!drag || !duration) return
    const pos = positionFromEvent(e.clientX)

    if (drag === 'seek') {
      onSeek(pos)
      return
    }

    const loop = loops.find((l) => l.id === drag.loopId)
    if (!loop) return

    // Never let the two edges cross.
    if (drag.edge === 'a') {
      onChangeLoop(loop.id, { a: loop.b != null ? Math.min(pos, loop.b - 0.1) : pos })
    } else {
      onChangeLoop(loop.id, { b: loop.a != null ? Math.max(pos, loop.a + 0.1) : pos })
    }
  }

  const startEdgeDrag = (loopId, edge) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { loopId, edge }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const pct = (v) => (duration ? `${Math.min(Math.max((v / duration) * 100, 0), 100)}%` : '0%')
  const active = loops.find((l) => l.id === activeLoopId)

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-10 cursor-pointer rounded-md bg-panel-2 ring-1 ring-edge"
      >
        {loops.map((loop, i) => {
          if (loop.a == null && loop.b == null) return null
          const [labelA, labelB] = loopLabels(i)
          const isActive = loop.id === activeLoopId
          const spans = complete(loop)

          return (
            <div key={loop.id}>
              {spans && (
                <div
                  className={`absolute inset-y-0 ${isActive ? 'bg-gold/30' : 'bg-muted/12'}`}
                  style={{ left: pct(loop.a), width: pct(loop.b - loop.a) }}
                />
              )}

              {loop.a != null && (
                <button
                  onPointerDown={startEdgeDrag(loop.id, 'a')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  aria-label={`Loop ${labelA} start at ${timecode(loop.a, true)} — drag to move`}
                  className="absolute top-0 z-10 -ml-2 flex h-full w-4 cursor-ew-resize items-start justify-center"
                  style={{ left: pct(loop.a) }}
                >
                  <span
                    className={`rounded-br rounded-tl px-1 text-[10px] font-bold leading-4 ${
                      isActive ? 'bg-gold text-ground' : 'bg-edge text-cream'
                    }`}
                  >
                    {labelA}
                  </span>
                </button>
              )}

              {loop.b != null && (
                <button
                  onPointerDown={startEdgeDrag(loop.id, 'b')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  aria-label={`Loop ${labelB} end at ${timecode(loop.b, true)} — drag to move`}
                  className="absolute top-0 z-10 -ml-2 flex h-full w-4 cursor-ew-resize items-end justify-center"
                  style={{ left: pct(loop.b) }}
                >
                  <span
                    className={`rounded-bl rounded-tr px-1 text-[10px] font-bold leading-4 ${
                      isActive ? 'bg-rust text-cream' : 'bg-edge text-cream'
                    }`}
                  >
                    {labelB}
                  </span>
                </button>
              )}
            </div>
          )
        })}

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
      </div>

      <div className="mt-1 flex justify-between font-mono text-xs text-muted">
        <span>{timecode(time)}</span>
        {active && complete(active) && (
          <span className="text-gold">
            looping {loopLabels(loops.indexOf(active))[0]}→
            {loopLabels(loops.indexOf(active))[1]} ({(active.b - active.a).toFixed(1)}s)
          </span>
        )}
        <span>{timecode(duration)}</span>
      </div>
    </div>
  )
}
