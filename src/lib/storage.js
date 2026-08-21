/**
 * All state lives in localStorage — there is no user account and no database.
 * Shows and their per-song practice settings stay on whichever machine you
 * practise on, which is the right trade for a personal tool.
 */

const SHOWS_KEY = 'sp:shows'
const songKey = (showId, videoId) => `sp:song:${showId}:${videoId}`

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('Could not save to localStorage:', err)
  }
}

/* ---------------------------------------------------------------- shows -- */

export function getShows() {
  const shows = read(SHOWS_KEY, [])
  // Soonest show first; undated shows sink to the bottom.
  return [...shows].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
}

export function getShow(id) {
  return getShows().find((s) => s.id === id) || null
}

export function saveShow(show) {
  const shows = read(SHOWS_KEY, [])
  const idx = shows.findIndex((s) => s.id === show.id)
  if (idx >= 0) shows[idx] = { ...shows[idx], ...show }
  else shows.push({ ...show, createdAt: new Date().toISOString() })
  write(SHOWS_KEY, shows)
  return show
}

export function deleteShow(id) {
  write(
    SHOWS_KEY,
    read(SHOWS_KEY, []).filter((s) => s.id !== id)
  )
  // Sweep up the orphaned per-song settings so storage doesn't grow forever.
  const prefix = `sp:song:${id}:`
  Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => localStorage.removeItem(k))
}

export function newShowId() {
  return `show_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/* ----------------------------------------------------- per-song settings -- */

export const DEFAULT_SONG_SETTINGS = {
  rate: 1, // YouTube playback rate (must be one of the allowed steps)
  tempo: 1, // audio-file mode: continuous 0.25–2.0
  pitch: 0, // audio-file mode: semitones, -12…+12
  loopA: null, // seconds, or null
  loopB: null, // seconds, or null
  loopOn: false,
  notes: '',
  done: false, // "I know this one" checkbox
}

export function getSongSettings(showId, videoId) {
  return { ...DEFAULT_SONG_SETTINGS, ...read(songKey(showId, videoId), {}) }
}

export function saveSongSettings(showId, videoId, patch) {
  const next = { ...getSongSettings(showId, videoId), ...patch }
  write(songKey(showId, videoId), next)
  return next
}

/* ------------------------------------------------------ backup / restore -- */

export function exportAll() {
  const data = { shows: read(SHOWS_KEY, []), songs: {} }
  Object.keys(localStorage)
    .filter((k) => k.startsWith('sp:song:'))
    .forEach((k) => {
      data.songs[k] = read(k, {})
    })
  return data
}

export function importAll(data) {
  if (!data || !Array.isArray(data.shows)) throw new Error('Not a valid backup file.')
  write(SHOWS_KEY, data.shows)
  Object.entries(data.songs || {}).forEach(([k, v]) => write(k, v))
}
