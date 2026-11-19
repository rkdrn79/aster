import type { ArxivPaperMetadata } from '../../shared/research/research-library'
import {
  parseArxivAtomFeed,
  parseArxivReference
} from '../../shared/research/research-library-arxiv'
import {
  parseCrossrefWork,
  parseDoiReference,
  type DoiPaperMetadata
} from '../../shared/research/research-library-doi'
import type { LibrarySearchFetch } from './research-library-search'

// Why the fetch is passed in: the desktop fetches through Electron's network stack, and orcad,
// which may not import Electron, through Node's.

const LOOKUP_TIMEOUT_MS = 20_000
const MAX_RESPONSE_CHARS = 1024 * 1024

export async function lookupArxivPaper(
  reference: string,
  fetchUrl: LibrarySearchFetch
): Promise<ArxivPaperMetadata> {
  const arxivId = parseArxivReference(reference)
  if (!arxivId) {
    throw new Error('Enter an arXiv ID such as 2410.12345, or an arXiv/alphaXiv link.')
  }
  const response = await fetchUrl(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`,
    { headers: { Accept: 'application/atom+xml' }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) }
  )
  if (response.status === 429 || response.status === 503) {
    throw new Error('arXiv is rate limiting requests. Try again in a minute.')
  }
  if (!response.ok) {
    throw new Error(`arXiv lookup failed (HTTP ${response.status}).`)
  }
  const feed = await response.text()
  if (feed.length > MAX_RESPONSE_CHARS) {
    throw new Error('arXiv returned an unexpectedly large response.')
  }
  const paper = parseArxivAtomFeed(feed)
  if (!paper) {
    throw new Error(`arXiv has no paper ${arxivId}.`)
  }
  return paper
}

/** Paper details for a DOI from Crossref; only ever called when the user asks to fill a paper. */
export async function lookupDoiPaper(
  reference: string,
  fetchUrl: LibrarySearchFetch
): Promise<DoiPaperMetadata> {
  const doi = parseDoiReference(reference)
  if (!doi) {
    throw new Error('Enter a DOI such as 10.1145/3292500.3330701.')
  }
  // Why: the URL is built from a validated DOI so a client cannot make the host fetch other hosts.
  const response = await fetchUrl(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
  })
  if (response.status === 404) {
    throw new Error(`Crossref has no record of ${doi}.`)
  }
  if (response.status === 429 || response.status === 503) {
    throw new Error('Crossref is rate limiting requests. Try again in a minute.')
  }
  if (!response.ok) {
    throw new Error(`DOI lookup failed (HTTP ${response.status}).`)
  }
  const text = await response.text()
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new Error('Crossref returned an unexpectedly large response.')
  }
  const paper = parseCrossrefWork(JSON.parse(text))
  if (!paper) {
    throw new Error(`Crossref has no title for ${doi}.`)
  }
  return paper
}
