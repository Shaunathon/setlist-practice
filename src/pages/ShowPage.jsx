import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CalendarDays, Eye, EyeOff, RefreshCw } from 'lucide-react'
import {
  clearRemovedIds,
  getRemovedIds,
  getShow,
  getSongSettings,
  removeSongId,
  saveSongSettings,
} from '../lib/storage'
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
  const [doneMap, setDoneMap] = useState({}) // videoId -> learned?
  const [hideDone, setHideDone] = useState(false)
  const [removedIds, setRemovedIds] = useState(() => getRemovedIds(id))

  // Whichever card is currently making sound, plus how to silence it.
  const playingRef = useRef(null)
  const claimPlayback = useCallback((videoId, pause) => {
    const previous = playingRef.current
    if (previous && previous.videoId !== videoId) previous.pause()
    playingRef.current = { videoId, pause }
  }, [])

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

  // Seed the learned flags from storage once the playlist arrives.
  useEffect(() => {
    if (!show?.id || !songs.length) return
    const map = {}
    songs.forEach((s) => {
      map[s.videoId] = !!getSongSettings(show.id, s.videoId).done
    })
    setDoneMap(map)
  }, [songs, show?.id])

  const toggleDone = useCallback(
    (videoId) => {
      setDoneMap((prev) => {
        const next = { ...prev, [videoId]: !prev[videoId] }
        saveSongSettings(show.id, videoId, { done: next[videoId] })
        return next
      })
    },
    [show?.id]
  )

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

  // "Learned" lives here rather than inside each card: the header count and the
  // hide toggle both need it, and a card owning it privately meant neither ever
  // updated until a reload.
  // Removed videos drop out of the list and out of the learned maths entirely —
  // "8 of 9" should count the songs you're actually working on.
  const keptSongs = useMemo(
    () => songs.filter((s) => !removedIds.includes(s.videoId)),
    [songs, removedIds]
  )
  const doneCount = keptSongs.filter((s) => doneMap[s.videoId]).length
  const visibleSongs = useMemo(
    () => (hideDone ? keptSongs.filter((s) => !doneMap[s.videoId]) : keptSongs),
    [hideDone, keptSongs, doneMap]
  )

  const removeSong = useCallback(
    (videoId) => {
      // Settings are left in storage on purpose, so a song that comes back on
      // Refresh still has its loop sections and notes.
      setRemovedIds(removeSongId(show.id, videoId).slice())
      if (playingRef.current?.videoId === videoId) {
        playingRef.current.pause()
        playingRef.current = null
      }
    },
    [show?.id]
  )

  const refresh = useCallback(() => {
    // Refresh is the deliberate re-sync: everything comes back, plus anything
    // added to the playlist since.
    setRemovedIds(clearRemovedIds(show.id))
    setReloadKey((k) => k + 1)
  }, [show?.id])

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
              <span className="text-cream">{doneCount}</span> / {keptSongs.length} learned
              {removedIds.length > 0 && (
                <span className="ml-2 text-muted/70">· {removedIds.length} removed</span>
              )}
            </span>
          )}

          {/* Only worth offering once there's something to hide. */}
          {status === 'ready' && doneCount > 0 && (
            <button
              onClick={() => setHideDone((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ring-1 transition-colors ${
                hideDone
                  ? 'bg-gold text-ground ring-gold'
                  : 'bg-panel-2 ring-edge hover:bg-edge'
              }`}
            >
              {hideDone ? <EyeOff size={14} /> : <Eye size={14} />}
              {hideDone ? `Learned hidden (${doneCount})` : 'Hide learned'}
            </button>
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-md bg-panel-2 px-3 py-1.5 text-sm ring-1 ring-edge hover:bg-edge"
            title="Re-sync with YouTube — restores removed videos and picks up new ones"
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

      {/* Hiding the last unlearned song would otherwise leave a blank page. */}
      {status === 'ready' && keptSongs.length > 0 && visibleSongs.length === 0 && (
        <div className="rounded-lg border border-dashed border-edge px-4 py-10 text-center">
          <p className="text-muted">
            Every song is marked learned. Nice — you're ready for this one.
          </p>
          <button
            onClick={() => setHideDone(false)}
            className="mt-3 text-sm text-gold underline"
          >
            Show all {keptSongs.length} anyway
          </button>
        </div>
      )}

      {status === 'ready' && songs.length > 0 && keptSongs.length === 0 && (
        <p className="py-12 text-center text-muted">
          Every video is removed. Hit Refresh to bring them back.
        </p>
      )}

      <div className="space-y-3">
        {status === 'ready' &&
          visibleSongs.map((song) => (
            <SongCard
              key={song.videoId}
              showId={show.id}
              song={song}
              // Keep the playlist's own numbering so it doesn't reshuffle
              // when songs are hidden or removed.
              index={keptSongs.indexOf(song)}
              done={!!doneMap[song.videoId]}
              onToggleDone={() => toggleDone(song.videoId)}
              onRemove={() => removeSong(song.videoId)}
              claimPlayback={claimPlayback}
            />
          ))}
      </div>

      <MetronomePanel />
    </div>
  )
}
