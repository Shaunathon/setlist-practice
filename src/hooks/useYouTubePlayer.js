import { useCallback, useEffect, useRef, useState } from 'react'
import { loadYouTubeAPI, FALLBACK_RATES } from '../lib/youtube'

/** Poll cadence while playing — tight enough that loops don't overshoot. */
const POLL_MS = 50
/** Idle cadence. A paused playhead only moves when the user scrubs it. */
const IDLE_POLL_MS = 250

/**
 * Wraps one YouTube IFrame player.
 *
 * The loop is enforced by polling: YouTube gives us no loop-region concept, so
 * we watch currentTime and seek back to A whenever it crosses B. `loopRef` is a
 * ref rather than props so the poll always reads current values without us
 * tearing down and rebuilding the interval on every loop edit.
 */
export function useYouTubePlayer({ videoId, loopRef, enabled = true }) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  // Optimistic playhead. getCurrentTime() lags a seek by a poll or two, so
  // repeated nudges would otherwise all read the same pre-seek value and a
  // double-tap of "back 5s" would only go back 5.
  const timeRef = useRef(0)
  // A player that has never played reports getCurrentTime() === 0 however far
  // you seek it, so until it has started once, our own value is the truthful one.
  const startedRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rates, setRates] = useState(FALLBACK_RATES)
  const [rate, setRateState] = useState(1)

  useEffect(() => {
    if (!enabled || !videoId || !hostRef.current) return
    let cancelled = false
    let player = null

    // YT.Player *replaces* the element it is handed, so give it a disposable
    // child rather than the React-managed host node. Without this, StrictMode's
    // double-mount leaves the first player orphaned in the DOM — visible and
    // audible, but not the one playerRef points at.
    const mount = document.createElement('div')
    mount.className = 'h-full w-full'
    hostRef.current.appendChild(mount)

    loadYouTubeAPI().then((YT) => {
      if (cancelled) return

      player = new YT.Player(mount, {
        videoId,
        playerVars: {
          rel: 0, // don't surface unrelated videos at the end
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return
            playerRef.current = e.target
            setDuration(e.target.getDuration() || 0)
            const available = e.target.getAvailablePlaybackRates?.()
            if (available?.length) setRates(available)
            setRateState(e.target.getPlaybackRate?.() ?? 1)
            setReady(true)
          },
          onStateChange: (e) => {
            if (cancelled) return
            setPlaying(e.data === YT.PlayerState.PLAYING)
            // Duration is often still 0 at onReady for some videos.
            if (e.data === YT.PlayerState.PLAYING) {
              startedRef.current = true
              const d = e.target.getDuration?.() || 0
              if (d) setDuration(d)
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      try {
        player?.destroy?.()
      } catch {
        /* player may already be gone during hot reload */
      }
      // destroy() swaps the iframe back for a placeholder div; removing our
      // wrapper takes whatever is left with it.
      mount.remove()
      playerRef.current = null
      setReady(false)
      setPlaying(false)
    }
  }, [videoId, enabled])

  // Playhead tracking + loop enforcement.
  //
  // Deliberately setInterval rather than requestAnimationFrame: rAF is
  // suspended in background tabs, which would silently stop the loop the moment
  // you switch away to read a chart. Timers keep firing (throttled) when hidden,
  // so the loop survives. It also cuts re-renders from 60/s to 20/s per card,
  // which matters on a setlist with a dozen songs.
  // Polls whenever the player exists, not only during playback: the position
  // has to stay accurate while paused too, or "Set A" after scrubbing a paused
  // video records a stale time. Setting the same number bails out of rendering,
  // so idle polling is close to free. Loop enforcement stays gated on playback,
  // since a paused playhead can't drift across the end point on its own.
  useEffect(() => {
    if (!ready) return

    const tick = () => {
      const p = playerRef.current
      if (!p?.getCurrentTime) return
      const t = p.getCurrentTime() || 0
      // Before first playback a reported 0 means "don't know", not "at the
      // start" — keep whatever position we last seeked to.
      if (startedRef.current || t > 0) {
        timeRef.current = t
        setTime(t)
      }

      if (!playing) return
      const loop = loopRef?.current
      if (loop?.loopOn && loop.loopA != null && loop.loopB != null && loop.loopB > loop.loopA) {
        // The lookahead absorbs the polling gap so we don't audibly overshoot
        // B before the seek lands.
        if (t >= loop.loopB - 0.05) p.seekTo(loop.loopA, true)
      }
    }

    const id = setInterval(tick, playing ? POLL_MS : IDLE_POLL_MS)
    return () => clearInterval(id)
  }, [ready, playing, loopRef])

  const play = useCallback(() => playerRef.current?.playVideo?.(), [])
  const pause = useCallback(() => playerRef.current?.pauseVideo?.(), [])
  const toggle = useCallback(() => {
    if (playing) playerRef.current?.pauseVideo?.()
    else playerRef.current?.playVideo?.()
  }, [playing])

  const seek = useCallback((seconds) => {
    const target = Math.max(0, seconds)
    playerRef.current?.seekTo?.(target, true)
    timeRef.current = target
    setTime(target)
  }, [])

  const nudge = useCallback((delta) => seek(timeRef.current + delta), [seek])

  const setRate = useCallback((next) => {
    playerRef.current?.setPlaybackRate?.(next)
    setRateState(next)
  }, [])

  const currentTime = useCallback(
    () => playerRef.current?.getCurrentTime?.() ?? timeRef.current,
    []
  )

  return {
    hostRef,
    ready,
    playing,
    time,
    duration,
    rates,
    rate,
    play,
    pause,
    toggle,
    seek,
    nudge,
    setRate,
    currentTime,
  }
}
