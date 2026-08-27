import { useEffect, useState } from 'react'
import { ChevronUp, Piano } from 'lucide-react'

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
 *
 * Starts collapsed to a pill, like the metronome: the strip is a full-width
 * band, and having it open itself over the songs on every page load would be
 * rude. The iframe stays mounted while collapsed so the çeşni and pitch you
 * picked survive — and so it isn't re-fetched every time you open it.
 */
export default function MakamKeyboardDock() {
  const [open, setOpen] = useState(false)
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
    // Only the pill and the strip take clicks — the rest of this band is the
    // page underneath, and must stay reachable while the keyboard is collapsed.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="flex justify-center">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse the makam keyboard' : 'Expand the makam keyboard'}
          className="pointer-events-auto flex items-center gap-2 rounded-t-lg bg-panel px-3 py-1.5 shadow-2xl ring-1 ring-edge hover:bg-panel-2"
        >
          <Piano size={16} className="shrink-0 text-gold" />
          <h2 className="text-base">Makam Keyboard</h2>
          <ChevronUp size={18} className={`text-muted ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div
        className="pointer-events-auto overflow-hidden shadow-2xl transition-[height] duration-150"
        style={{ height: open ? height : 0 }}
      >
        <iframe
          src={KEYBOARD_URL}
          title="Makam keyboard"
          className="w-full border-0 bg-neutral-950"
          style={{ height }}
          allow="autoplay"
        />
      </div>
    </div>
  )
}
