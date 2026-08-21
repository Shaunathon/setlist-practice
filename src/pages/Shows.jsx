import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Download, Plus, Trash2, Upload } from 'lucide-react'
import {
  deleteShow,
  exportAll,
  getShows,
  importAll,
  newShowId,
  saveShow,
} from '../lib/storage'
import { daysUntil, parsePlaylistId, showDate } from '../lib/format'

const field =
  'w-full rounded-md bg-panel-2 px-3 py-2 text-sm ring-1 ring-edge placeholder:text-muted/60'

export default function Shows() {
  const [shows, setShows] = useState(getShows)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', venue: '', playlist: '' })
  const [error, setError] = useState('')
  const importRef = useRef(null)

  useEffect(() => {
    document.title = 'Setlist Practice'
  }, [])

  const refresh = () => setShows(getShows())

  const submit = (e) => {
    e.preventDefault()
    const playlistId = parsePlaylistId(form.playlist)
    if (!form.name.trim()) return setError('Give the show a name.')
    if (!playlistId)
      return setError('Paste a YouTube playlist URL or ID (the part after "list=").')

    saveShow({
      id: newShowId(),
      name: form.name.trim(),
      date: form.date,
      venue: form.venue.trim(),
      playlistId,
    })
    setForm({ name: '', date: '', venue: '', playlist: '' })
    setError('')
    setAdding(false)
    refresh()
  }

  const remove = (show) => {
    if (!confirm(`Delete "${show.name}"? Its loop points and notes go with it.`)) return
    deleteShow(show.id)
    refresh()
  }

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `setlist-practice-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doImport = async (file) => {
    if (!file) return
    try {
      importAll(JSON.parse(await file.text()))
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl text-gold">Setlist Practice</h1>
          <p className="mt-1 text-sm text-muted">
            One page per show — metronome, videos, loops, and speed in one place.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={doExport}
            title="Download a backup of all shows and settings"
            className="rounded-md bg-panel-2 p-2 ring-1 ring-edge hover:bg-edge"
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => importRef.current?.click()}
            title="Restore from a backup file"
            className="rounded-md bg-panel-2 p-2 ring-1 ring-edge hover:bg-edge"
          >
            <Upload size={16} />
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => doImport(e.target.files?.[0])}
          />
        </div>
      </header>

      <ul className="space-y-2">
        {shows.map((show) => {
          const days = daysUntil(show.date)
          return (
            <li key={show.id}>
              <div className="group flex items-center gap-3 rounded-lg bg-panel px-4 py-3 ring-1 ring-edge hover:ring-gold/50">
                <Link to={`/show/${show.id}`} className="min-w-0 flex-1">
                  <h2 className="truncate text-xl">{show.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                    <CalendarDays size={13} />
                    {showDate(show.date)}
                    {show.venue && <span>· {show.venue}</span>}
                  </p>
                </Link>

                {days != null && (
                  <span
                    className={`shrink-0 rounded px-2 py-1 text-xs ${
                      days < 0
                        ? 'bg-panel-2 text-muted'
                        : days <= 7
                          ? 'bg-rust/25 text-cream'
                          : 'bg-gold/20 text-gold'
                    }`}
                  >
                    {days < 0 ? 'past' : days === 0 ? 'today' : `${days}d`}
                  </span>
                )}

                <button
                  onClick={() => remove(show)}
                  aria-label={`Delete ${show.name}`}
                  className="shrink-0 rounded p-1.5 text-muted opacity-0 transition-opacity hover:bg-panel-2 hover:text-rust focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {shows.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-edge px-4 py-10 text-center text-muted">
          No shows yet. Add one below to get started.
        </p>
      )}

      {/* ------------------------------------------------------- add form -- */}
      {adding ? (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg bg-panel p-4 ring-1 ring-edge">
          <h2 className="text-xl">New show</h2>
          <input
            className={field}
            placeholder="Show name — e.g. Hali Konseri"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={field}
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <input
              className={field}
              placeholder="Venue (optional)"
              value={form.venue}
              onChange={(e) => setForm({ ...form, venue: e.target.value })}
            />
          </div>
          <input
            className={field}
            placeholder="YouTube playlist URL or ID"
            value={form.playlist}
            onChange={(e) => setForm({ ...form, playlist: e.target.value })}
          />
          <p className="text-xs text-muted">
            The playlist must be public or unlisted — an API key can't reach fully
            private playlists.
          </p>
          {error && <p className="text-sm text-rust">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-gold px-4 py-2 text-sm font-bold text-ground hover:bg-gold/90">
              Create show
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setError('')
              }}
              className="rounded-md bg-panel-2 px-4 py-2 text-sm ring-1 ring-edge hover:bg-edge"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-edge py-3 text-muted hover:border-gold hover:text-gold"
        >
          <Plus size={17} /> Add a show
        </button>
      )}
    </div>
  )
}
