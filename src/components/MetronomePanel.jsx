import { useState } from 'react'
import { ChevronDown, ExternalLink, Timer } from 'lucide-react'

const METRONOME_URL = 'https://tacotacoburrito.com'

/**
 * The metronome docks bottom-right and stays mounted while you scroll the
 * setlist, so its tempo survives moving between songs. Collapsing only hides
 * the panel — the iframe keeps running underneath.
 */
export default function MetronomePanel() {
  const [open, setOpen] = useState(false)

  return (
    // Collapsed, this shrinks to a pill so it stops covering the song controls
    // on shorter screens; expanded, overlaying is fine because you're using it.
    <div
      className={`fixed bottom-0 right-4 z-40 ${
        open ? 'w-[min(28rem,calc(100vw-2rem))]' : 'w-auto'
      }`}
    >
      <div className="overflow-hidden rounded-t-lg bg-panel shadow-2xl ring-1 ring-edge">
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
            <ChevronDown size={18} className={open ? '' : '-rotate-180'} />
          </button>
        </div>

        {/* Kept in the DOM when collapsed so the tempo isn't lost. */}
        <div className={open ? 'block' : 'hidden'}>
          <iframe
            src={METRONOME_URL}
            title="Metronome"
            className="h-[26rem] w-full border-0 bg-white"
            allow="autoplay"
          />
        </div>
      </div>
    </div>
  )
}
