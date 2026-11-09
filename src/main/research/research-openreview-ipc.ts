import { ipcMain, net } from 'electron'
import {
  openReviewForumId,
  parseOpenReviewNotes,
  type OpenReviewForumReviews
} from '../../shared/research/openreview-reviews'

// Why both: venues since 2023 live on API v2; older forums are only served by API v1.
const API_BASES = ['https://api2.openreview.net', 'https://api.openreview.net']
const FETCH_TIMEOUT_MS = 20_000
const MAX_REPLY_CHARS = 8 * 1024 * 1024

/** Electron's `net.fetch` on the desktop, so the system proxy applies. */
export type OpenReviewFetch = (url: string, init: RequestInit) => Promise<Response>

/** The public reviews of a forum; reviews only the authors may see need an OpenReview sign-in. */
export async function fetchOpenReviewForum(
  fetchUrl: OpenReviewFetch,
  input: string
): Promise<OpenReviewForumReviews> {
  const forum = openReviewForumId(input)
  if (!forum) {
    throw new Error('Paste an OpenReview forum link (openreview.net/forum?id=…) or its ID.')
  }
  let failure: string | null = null
  for (const base of API_BASES) {
    const response = await fetchUrl(`${base}/notes?forum=${encodeURIComponent(forum)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (response.status === 429) {
      throw new Error('OpenReview is limiting requests. Try again in a minute.')
    }
    if (!response.ok) {
      failure = `OpenReview answered HTTP ${response.status}.`
      continue
    }
    const body = await response.text()
    if (body.length > MAX_REPLY_CHARS) {
      throw new Error('The OpenReview forum is unexpectedly large.')
    }
    const parsed = parseOpenReviewNotes(forum, JSON.parse(body))
    if (parsed.reviews.length || parsed.title) {
      return parsed
    }
  }
  if (failure) {
    throw new Error(failure)
  }
  return { forum, title: null, venue: null, reviews: [] }
}

export function registerResearchOpenReviewIpcHandlers(): void {
  ipcMain.handle('researchOpenReview:fetchForum', (_event, input: unknown) => {
    const forum = input && typeof input === 'object' ? Reflect.get(input, 'forum') : null
    return fetchOpenReviewForum(
      (url, init) => net.fetch(url, init),
      typeof forum === 'string' ? forum : ''
    )
  })
}
