import { useState } from 'react'
import { ChevronRight, ExternalLink, Timer } from 'lucide-react'

const METRONOME_URL = 'https://tacotacoburrito.com'

/**
 * The metronome docks against the right edge, vertically centred, and stays
 * mounted while you scroll the setlist, so its tempo survives moving between
 * songs. Collapsing only hides the panel — the iframe keeps running underneath.
 *
 * It sits on the right rather than the bottom because the makam keyboard owns
 * the bottom strip now, and below the keyboard's z-50 so the keys stay clickable
 * even when this is expanded over them on a short screen.
 */
export default function MetronomePanel() {
  const [open, setOpen] = useState(false)

  return (
    // Collapsed, this shrinks to a pill so it stops covering the song controls;
    // expanded, overlaying is fine because you're using it. Either way it stays
    // pinned to the right edge and centred in the viewport.
    <div
      className={`fixed right-0 top-1/2 z-40 -translate-y-1/2 ${
        open ? 'w-[min(28rem,calc(100vw-2rem))]' : 'w-auto'
      }`}
    >
      <div className="overflow-hidden rounded-l-lg bg-panel shadow-2xl ring-1 ring-edge">
        <div className="flex items-center gap-2 px-3 py-2">
          <Timer size={16} className="shrink-0 text-gold" />
          <h2 className={`text-base ${open ? 'flex-1' : ''}`}>Metronome</h2>
          <a
            href={METRONOME_URL}
            target="_blank"
            rel="noreferrer"
            className={`rounded p-1 text-muted hover:bg-panel-2 hover:text-cream ${
              open ? '' : 'hidden'
            }`}
            title="Open in a new tab"
          >
            <ExternalLink size={14} />
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded p-1 text-muted hover:bg-panel-2 hover:text-cream"
            aria-label={open ? 'Collapse metronome' : 'Expand metronome'}
          >
            <ChevronRight size={18} className={open ? '' : 'rotate-180'} />
          </button>
        </div>

        {/* Kept in the DOM when collapsed so the tempo isn't lost. */}
        <div className={open ? 'block' : 'hidden'}>
          <iframe
            src={METRONOME_URL}
            title="Metronome"
            className="h-[min(26rem,calc(100vh-10rem))] w-full border-0 bg-white"
            allow="autoplay"
          />
        </div>
      </div>
    </div>
  )
}
