import { useEffect, useState } from 'react'

// Point VITE_MAKAM_KEYBOARD_URL at a local makam-keyboard dev server to try
// changes to the keyboard itself; everything else uses the deployed one.
const KEYBOARD_URL =
  import.meta.env.VITE_MAKAM_KEYBOARD_URL ||
  'https://shaunathon.github.io/makam-keyboard/?dock=1'
const KEYBOARD_ORIGIN = new URL(KEYBOARD_URL).origin

// What the keyboard app currently asks for: a row of controls above the 60px
// key strip. It posts its own height on load, so this only has to be right for
// the moment before that arrives.
const DEFAULT_HEIGHT = 112
const MIN_HEIGHT = 60
const MAX_HEIGHT = 240

/**
 * The makam keyboard, docked across the bottom of the viewport and kept above
 * everything else so it is never covered.
 *
 * It lives on shaunathon.github.io, so nothing here can measure it — the
 * keyboard posts the height it wants and this frame follows.
 */
export default function MakamKeyboardDock() {
  const [height, setHeight] = useState(DEFAULT_HEIGHT)

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== KEYBOARD_ORIGIN) return
      const data = event.data
      if (!data || data.source !== 'makam-keyboard' || data.type !== 'height') return

      const asked = Number(data.height)
      if (!Number.isFinite(asked)) return
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(asked))))
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 shadow-2xl transition-[height] duration-150"
      style={{ height }}
    >
      <iframe
        src={KEYBOARD_URL}
        title="Makam keyboard"
        className="h-full w-full border-0 bg-neutral-950"
        allow="autoplay"
      />
    </div>
  )
}
