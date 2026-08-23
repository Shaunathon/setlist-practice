import { useCallback, useEffect, useRef, useState } from 'react'

const CHANNEL = 'sp-transpose'
const PING_MS = 800

/**
 * Talks to the companion extension's content script inside a YouTube embed.
 *
 * The page itself can't reach the embed's audio — same-origin policy — so the
 * extension does the work from inside the frame and we only send it numbers.
 * Without the extension installed nothing answers, `available` stays false, and
 * the card falls back to explaining why transpose is unavailable.
 */
export function useTransposeBridge({ hostRef, semitones, enabled }) {
  const [available, setAvailable] = useState(false)
  const availableRef = useRef(false)

  const frameWindow = useCallback(
    () => hostRef.current?.querySelector('iframe')?.contentWindow || null,
    [hostRef]
  )

  // Listen for the content script announcing itself, and keep pinging until it
  // does — the frame may still be loading when we first ask.
  useEffect(() => {
    if (!enabled) return

    const onMessage = (event) => {
      if (event.data?.source !== CHANNEL) return
      if (event.data.type !== 'ready' && event.data.type !== 'applied') return
      // Only trust a frame belonging to this card.
      if (event.source !== frameWindow()) return
      availableRef.current = true
      setAvailable(true)
    }

    window.addEventListener('message', onMessage)

    const ping = setInterval(() => {
      if (availableRef.current) return
      frameWindow()?.postMessage({ source: CHANNEL, type: 'ping' }, '*')
    }, PING_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      clearInterval(ping)
    }
  }, [enabled, frameWindow])

  // Push the current interval whenever it changes, or once the frame turns up.
  useEffect(() => {
    if (!enabled || !available) return
    frameWindow()?.postMessage({ source: CHANNEL, type: 'pitch', semitones }, '*')
  }, [enabled, available, semitones, frameWindow])

  return available
}
