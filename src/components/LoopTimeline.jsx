import { useCallback, useRef } from 'react'
import { loopLabels, timecode } from '../lib/format'

/**
 * Scrub bar showing every loop section at once.
 *
 * Clicking inside a section arms it and restarts it from its start point — not
 * from the pixel you clicked — which is the quick way to move between sections.
 * Clicking anywhere else releases the armed section and seeks to exactly where
 * you clicked.
 *
 * The section markers are deliberately NOT draggable. Practice loops are short,
 * so drag targets sat on top of most of the region and swallowed the clicks that
 * were meant to select it. Points are moved with the Set buttons instead.
 */
export default function LoopTimeline({ duration, time, loops, activeLoopId, onSeek, onJumpToLoop }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)

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

  const handlePointerDown = (e) => {
    if (!duration) return
    const pos = positionFromEvent(e.clientX)

    // Landing inside a section means "take me to this loop", not "seek here".
    const hit = loops.find((l) => complete(l) && pos >= l.a && pos <= l.b)
    if (hit) {
      onJumpToLoop(hit.id)
      return
    }

    draggingRef.current = true
    trackRef.current.setPointerCapture?.(e.pointerId)
    onSeek(pos)
  }

  const handlePointerMove = (e) => {
    if (!draggingRef.current || !duration) return
    onSeek(positionFromEvent(e.clientX))
  }

  const endDrag = () => {
    draggingRef.current = false
  }

  const pct = (v) => (duration ? `${Math.min(Math.max((v / duration) * 100, 0), 100)}%` : '0%')
  const active = loops.find((l) => l.id === activeLoopId)

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-10 cursor-pointer rounded-md bg-panel-2 ring-1 ring-edge"
      >
        {loops.map((loop, i) => {
          if (loop.a == null && loop.b == null) return null
          const [labelA, labelB] = loopLabels(i)
          const isActive = loop.id === activeLoopId

          return (
            // pointer-events-none throughout: every click belongs to the track,
            // so even a one-second section stays selectable.
            <div key={loop.id} className="pointer-events-none">
              {complete(loop) && (
                <div
                  className={`absolute inset-y-0 ${isActive ? 'bg-gold/30' : 'bg-muted/12'}`}
                  style={{ left: pct(loop.a), width: pct(loop.b - loop.a) }}
                />
              )}

              {loop.a != null && (
                <span
                  className={`absolute top-0 -ml-1.5 rounded-br rounded-tl px-1 text-[10px] font-bold leading-4 ${
                    isActive ? 'bg-gold text-ground' : 'bg-edge text-cream'
                  }`}
                  style={{ left: pct(loop.a) }}
                >
                  {labelA}
                </span>
              )}

              {loop.b != null && (
                <span
                  className={`absolute bottom-0 -ml-1.5 rounded-bl rounded-tr px-1 text-[10px] font-bold leading-4 ${
                    isActive ? 'bg-rust text-cream' : 'bg-edge text-cream'
                  }`}
                  style={{ left: pct(loop.b) }}
                >
                  {labelB}
                </span>
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
