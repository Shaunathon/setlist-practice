/**
 * GET /api/playlist?id=<playlistId>
 *
 * Proxies the YouTube Data API so YOUTUBE_API_KEY stays on the server and is
 * never shipped to the browser. Returns a normalised, minimal song list.
 *
 * Works for public and unlisted playlists (the playlist generator creates
 * unlisted ones). Fully *private* playlists are not reachable with an API key
 * — those need OAuth, so make the playlist unlisted instead.
 */

const MAX_PAGES = 4 // 4 * 50 = up to 200 videos per show

export default async (req) => {
  const url = new URL(req.url)
  const playlistId = url.searchParams.get('id')

  if (!playlistId) {
    return json({ error: 'Missing ?id= playlist parameter.' }, 400)
  }

  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    return json(
      { error: 'YOUTUBE_API_KEY is not set on the server. See .env.example.' },
      500
    )
  }

  try {
    const items = []
    let pageToken = ''

    for (let page = 0; page < MAX_PAGES; page++) {
      const api = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
      api.searchParams.set('part', 'snippet,contentDetails,status')
      api.searchParams.set('maxResults', '50')
      api.searchParams.set('playlistId', playlistId)
      api.searchParams.set('key', key)
      if (pageToken) api.searchParams.set('pageToken', pageToken)

      const res = await fetch(api)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const reason = body?.error?.message || `YouTube API returned ${res.status}`
        return json({ error: reason }, res.status === 404 ? 404 : 502)
      }

      const data = await res.json()
      items.push(...(data.items || []))

      pageToken = data.nextPageToken || ''
      if (!pageToken) break
    }

    const songs = items
      // Deleted/private videos come back as placeholders with no usable id.
      .filter((it) => it?.contentDetails?.videoId && it?.snippet?.title !== 'Deleted video')
      .map((it) => ({
        videoId: it.contentDetails.videoId,
        title: it.snippet.title,
        channel: it.snippet.videoOwnerChannelTitle || '',
        thumbnail:
          it.snippet.thumbnails?.medium?.url ||
          it.snippet.thumbnails?.default?.url ||
          '',
        position: it.snippet.position ?? 0,
      }))
      .sort((a, b) => a.position - b.position)

    return json(
      { playlistId, count: songs.length, songs },
      200,
      // Cache at the edge for 5 min; a playlist edit shows up on the next refresh.
      { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' }
    )
  } catch (err) {
    return json({ error: err.message || 'Unexpected error fetching playlist.' }, 500)
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}
