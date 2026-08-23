/** mm:ss, or m:ss.t when we need sub-second precision for loop points. */
export function timecode(seconds, precise = false) {
  if (seconds == null || Number.isNaN(seconds)) return '–:––'
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return precise
    ? `${m}:${rest.toFixed(1).padStart(4, '0')}`
    : `${m}:${String(Math.floor(rest)).padStart(2, '0')}`
}

/** "+2" / "−3" / "0" — semitone display with a real minus sign. */
export function semitoneLabel(n) {
  if (n === 0) return '0'
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`
}

/**
 * Loop labels come from position, never from stored state: row 1 is always A/B,
 * row 2 always C/D. Delete a row and the ones below re-letter themselves.
 */
export function loopLabels(index) {
  const first = 65 + index * 2 // 65 = 'A'
  return [String.fromCharCode(first), String.fromCharCode(first + 1)]
}

/** A–Z is 13 pairs; past that the labels would run off the end of the alphabet. */
export const MAX_LOOPS = 13

/** 0.85 → "85%" */
export function percentLabel(rate) {
  return `${Math.round(rate * 100)}%`
}

/** Pull the playlist id out of a full URL, or accept a bare id. */
export function parsePlaylistId(input) {
  if (!input) return ''
  const trimmed = input.trim()
  const match = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/)
  if (match) return match[1]
  // A bare id — playlists start with PL/UU/LL/FL/OL/RD.
  if (/^[A-Za-z0-9_-]{12,}$/.test(trimmed)) return trimmed
  return ''
}

/** Format an ISO date (yyyy-mm-dd) for display without timezone drift. */
export function showDate(iso) {
  if (!iso) return 'Date TBD'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Whole days until a show; negative once it's past. */
export function daysUntil(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  const target = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}
