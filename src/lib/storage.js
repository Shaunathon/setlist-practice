/**
 * All state lives in localStorage — there is no user account and no database.
 * Shows and their per-song practice settings stay on whichever machine you
 * practise on, which is the right trade for a personal tool.
 */

const SHOWS_KEY = 'sp:shows'
const songKey = (showId, videoId) => `sp:song:${showId}:${videoId}`
const removedKey = (showId) => `sp:removed:${showId}`

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
  localStorage.removeItem(removedKey(id))
}

export function newShowId() {
  return `show_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/* ----------------------------------------------------- per-song settings -- */

export const DEFAULT_SONG_SETTINGS = {
  rate: 1, // YouTube playback rate (must be one of the allowed steps)
  tempo: 1, // audio-file mode: continuous 0.25–2.0
  pitch: 0, // audio-file mode: semitones, -12…+12
  loops: [], // ordered [{ id, a, b }] — labels (A/B, C/D…) come from position
  activeLoopId: null, // the one section currently repeating, or null
  notes: '',
  done: false, // "I know this one" checkbox
}

export function newLoopId() {
  return `loop_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Settings were once a single loop (loopA/loopB/loopOn). Fold that into the
 * first entry of the loops array so existing loop points survive the upgrade.
 */
function migrateSongSettings(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = { ...raw }

  if (!Array.isArray(out.loops)) {
    if (out.loopA != null || out.loopB != null) {
      const id = newLoopId()
      out.loops = [{ id, a: out.loopA ?? null, b: out.loopB ?? null }]
      out.activeLoopId = out.loopOn ? id : null
    } else {
      out.loops = []
      out.activeLoopId = null
    }
  }

  delete out.loopA
  delete out.loopB
  delete out.loopOn
  return out
}

export function getSongSettings(showId, videoId) {
  return {
    ...DEFAULT_SONG_SETTINGS,
    ...migrateSongSettings(read(songKey(showId, videoId), {})),
  }
}

export function saveSongSettings(showId, videoId, patch) {
  const next = { ...getSongSettings(showId, videoId), ...patch }
  write(songKey(showId, videoId), next)
  return next
}

/* --------------------------------------------------------- removed songs -- */

/**
 * Videos hidden from a show's list. The shared YouTube playlists carry several
 * versions of the same tune and can't be edited, so this is a personal filter
 * over someone else's playlist — nothing is ever sent to YouTube.
 *
 * Per-song settings are deliberately NOT deleted alongside, so a song that
 * comes back on Refresh still has its loops and notes.
 */
export function getRemovedIds(showId) {
  return read(removedKey(showId), [])
}

export function removeSongId(showId, videoId) {
  const ids = getRemovedIds(showId)
  if (!ids.includes(videoId)) ids.push(videoId)
  write(removedKey(showId), ids)
  return ids
}

/** Refresh is the deliberate "re-sync with YouTube" action: everything back. */
export function clearRemovedIds(showId) {
  write(removedKey(showId), [])
  return []
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
