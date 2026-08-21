import { useCallback, useEffect, useRef, useState } from 'react'
import { PitchShifter } from 'soundtouchjs'

// Larger buffers cost latency but survive tab-switching without glitching.
// 16384 is SoundTouchJS's own recommended size for offline-style playback.
const BUFFER_SIZE = 16384

/**
 * Amazing-Slow-Downer-grade playback for a *local* audio file.
 *
 * SoundTouchJS time-stretches and pitch-shifts independently, so tempo and key
 * are genuinely separate controls — unlike the YouTube player, where speed is
 * the only lever and pitch is untouchable.
 *
 * Playback is started and stopped by connecting/disconnecting the node: the
 * underlying ScriptProcessor is only pulled while it is wired to a destination.
 */
export function useAudioEngine({ loopRef }) {
  const ctxRef = useRef(null)
  const gainRef = useRef(null)
  const shifterRef = useRef(null)
  const connectedRef = useRef(false)
  // Mirrors `time` so callers can read the playhead without taking a
  // dependency on state that changes 20 times a second.
  const timeRef = useRef(0)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const disconnect = useCallback(() => {
    if (connectedRef.current && shifterRef.current) {
      try {
        shifterRef.current.disconnect()
      } catch {
        /* already torn down */
      }
      connectedRef.current = false
    }
    setPlaying(false)
  }, [])

  const teardown = useCallback(() => {
    disconnect()
    shifterRef.current = null
    setReady(false)
    timeRef.current = 0
    setTime(0)
    setDuration(0)
    setFileName('')
  }, [disconnect])

  useEffect(() => {
    return () => {
      disconnect()
      ctxRef.current?.close?.().catch(() => {})
    }
  }, [disconnect])

  /** Decode a File/Blob and build the shifter around it. */
  const load = useCallback(
    async (file) => {
      setLoading(true)
      setError('')
      try {
        if (!ctxRef.current) {
          ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
          gainRef.current = ctxRef.current.createGain()
          gainRef.current.connect(ctxRef.current.destination)
        }
        const ctx = ctxRef.current

        disconnect()

        const arrayBuffer = await file.arrayBuffer()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

        const shifter = new PitchShifter(ctx, audioBuffer, BUFFER_SIZE, () => {
          // Reached the end of the file.
          disconnect()
        })

        shifter.on('play', (detail) => {
          const t = detail.timePlayed
          timeRef.current = t
          setTime(t)

          const loop = loopRef?.current
          if (loop?.loopOn && loop.loopA != null && loop.loopB != null && loop.loopB > loop.loopA) {
            if (t >= loop.loopB) {
              // The setter takes a 0–1 fraction even though the getter
              // reports 0–100. Wrapping it here keeps that quirk contained.
              shifter.percentagePlayed = loop.loopA / audioBuffer.duration
              timeRef.current = loop.loopA
              setTime(loop.loopA)
            }
          }
        })

        shifterRef.current = shifter
        setDuration(audioBuffer.duration)
        setFileName(file.name)
        timeRef.current = 0
        setTime(0)
        setReady(true)
      } catch (err) {
        setError(
          err?.name === 'EncodingError' || err?.name === 'NotSupportedError'
            ? 'Could not decode that file. Try MP3, WAV, M4A, or FLAC.'
            : err.message || 'Could not load that audio file.'
        )
        setReady(false)
      } finally {
        setLoading(false)
      }
    },
    [disconnect, loopRef]
  )

  const play = useCallback(() => {
    const shifter = shifterRef.current
    const ctx = ctxRef.current
    if (!shifter || !ctx) return
    if (ctx.state === 'suspended') ctx.resume()
    if (!connectedRef.current) {
      shifter.connect(gainRef.current)
      connectedRef.current = true
    }
    setPlaying(true)
  }, [])

  const pause = useCallback(() => disconnect(), [disconnect])

  const toggle = useCallback(() => {
    if (connectedRef.current) pause()
    else play()
  }, [pause, play])

  const seek = useCallback(
    (seconds) => {
      const shifter = shifterRef.current
      if (!shifter || !duration) return
      const clamped = Math.min(Math.max(0, seconds), duration)
      shifter.percentagePlayed = clamped / duration
      timeRef.current = clamped
      setTime(clamped)
    },
    [duration]
  )

  const nudge = useCallback((delta) => seek(timeRef.current + delta), [seek])

  const currentTime = useCallback(() => timeRef.current, [])

  const setTempo = useCallback((tempo) => {
    if (shifterRef.current) shifterRef.current.tempo = tempo
  }, [])

  const setPitch = useCallback((semitones) => {
    if (shifterRef.current) shifterRef.current.pitchSemitones = semitones
  }, [])

  return {
    load,
    teardown,
    ready,
    loading,
    error,
    playing,
    time,
    duration,
    fileName,
    play,
    pause,
    toggle,
    seek,
    nudge,
    currentTime,
    setTempo,
    setPitch,
  }
}
