import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CalendarDays, RefreshCw } from 'lucide-react'
import { getShow } from '../lib/storage'
import { showDate } from '../lib/format'
import SongCard from '../components/SongCard'
import MetronomePanel from '../components/MetronomePanel'

export default function ShowPage() {
  const { id } = useParams()
  const [show, setShow] = useState(() => getShow(id))
  const [songs, setSongs] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setShow(getShow(id))
  }, [id])

  useEffect(() => {
    if (!show?.playlistId) return
    let cancelled = false
    setStatus('loading')

    fetch(`/api/playlist?id=${encodeURIComponent(show.playlistId)}`)
      .then(async (res) => {
        // A dev server without the function attached answers /api/* with the
        // SPA's index.html at status 200 — treat anything non-JSON as an error
        // rather than silently reading it as an empty playlist.
        if (!res.headers.get('content-type')?.includes('application/json')) {
          throw new Error('The playlist endpoint did not return JSON.')
        }
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
        return body
      })
      .then((data) => {
        if (cancelled) return
        setSongs(data.songs || [])
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [show?.playlistId, reloadKey])

  useEffect(() => {
    document.title = show ? `${show.name} — Setlist Practice` : 'Setlist Practice'
  }, [show])

  if (!show) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-muted">That show isn't on this device.</p>
        <Link to="/" className="mt-3 inline-block text-gold underline">
          Back to all shows
        </Link>
      </div>
    )
  }

  const learned = songs.filter((s) => {
    try {
      return JSON.parse(localStorage.getItem(`sp:song:${show.id}:${s.videoId}`) || '{}').done
    } catch {
      return false
    }
  }).length

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-gold"
      >
        <ArrowLeft size={15} /> All shows
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <h1 className="text-4xl text-gold">{show.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <CalendarDays size={14} />
            {showDate(show.date)}
            {show.venue && <span>· {show.venue}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'ready' && (
            <span className="text-sm text-muted">
              <span className="text-cream">{learned}</span> / {songs.length} learned
            </span>
          )}
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-md bg-panel-2 px-3 py-1.5 text-sm ring-1 ring-edge hover:bg-edge"
            title="Re-fetch the playlist from YouTube"
          >
            <RefreshCw size={14} className={status === 'loading' ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {status === 'loading' && <p className="py-12 text-center text-muted">Loading playlist…</p>}

      {status === 'error' && (
        <div className="rounded-lg bg-panel p-5 ring-1 ring-rust/50">
          <p className="flex items-center gap-2 text-rust">
            <AlertTriangle size={18} /> Couldn't load the playlist
          </p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <p className="mt-3 text-sm text-muted">
            Running locally? The playlist endpoint is a Netlify Function, so start
            the server with <code className="rounded bg-panel-2 px-1.5 py-0.5">netlify dev</code>{' '}
            rather than <code className="rounded bg-panel-2 px-1.5 py-0.5">npm run dev</code>,
            and make sure <code className="rounded bg-panel-2 px-1.5 py-0.5">YOUTUBE_API_KEY</code>{' '}
            is set in <code className="rounded bg-panel-2 px-1.5 py-0.5">.env</code>.
          </p>
        </div>
      )}

      {status === 'ready' && songs.length === 0 && (
        <p className="py-12 text-center text-muted">That playlist has no playable videos.</p>
      )}

      <div className="space-y-3">
        {status === 'ready' &&
          songs.map((song, i) => (
            <SongCard key={song.videoId} showId={show.id} song={song} index={i} />
          ))}
      </div>

      <MetronomePanel />
    </div>
  )
}
