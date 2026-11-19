import type { ArxivPaperMetadata } from '../../shared/research/research-library'
import { parseArxivAtomEntries } from '../../shared/research/research-library-arxiv'
import {
  parseCrossrefSearch,
  type DoiPaperMetadata
} from '../../shared/research/research-library-doi'
import {
  isConfidentTitleMatch,
  normalizePaperTitle,
  type TitleQuery
} from '../../shared/research/research-library-paper-match'

const LOOKUP_TIMEOUT_MS = 20_000
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024
const RESULTS = 5

export type TitleSearchResult =
  | { source: 'arxiv'; paper: ArxivPaperMetadata }
  | { source: 'crossref'; paper: DoiPaperMetadata }

export type LibrarySearchFetch = (url: string, init: RequestInit) => Promise<Response>

async function fetchText(fetchUrl: LibrarySearchFetch, url: string, accept: string) {
  const response = await fetchUrl(url, {
    headers: { Accept: accept },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
  })
  if (response.status === 429 || response.status === 503) {
    throw new Error('The paper lookup is rate limited. Try again in a minute.')
  }
  if (!response.ok) {
    throw new Error(`The paper lookup failed (HTTP ${response.status}).`)
  }
  const text = await response.text()
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new Error('The paper lookup returned an unexpectedly large response.')
  }
  return text
}

/** The title's words for an arXiv phrase search; a slug's last two words may be author names. */
function phraseWords(query: TitleQuery): string[] {
  const words = normalizePaperTitle(query.title).split(' ').filter(Boolean).slice(0, 24)
  return query.slug && words.length >= 5 ? words.slice(0, -2) : words
}

/**
 * The one paper a citation names, from an arXiv title search, else Crossref's bibliographic search;
 * null when neither finds a confident match (same title, and the cited year and first author).
 */
export async function searchPaperByTitle(
  query: TitleQuery,
  fetchUrl: LibrarySearchFetch
): Promise<TitleSearchResult | null> {
  const phrase = phraseWords(query).join(' ')
  if (phrase.split(' ').length < 2) {
    return null
  }
  const feed = await fetchText(
    fetchUrl,
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`ti:"${phrase}"`)}&max_results=${RESULTS}`,
    'application/atom+xml'
  )
  const arxiv = parseArxivAtomEntries(feed).find((paper) =>
    isConfidentTitleMatch(query, { title: paper.title, year: paper.year, authors: paper.authors })
  )
  if (arxiv) {
    return { source: 'arxiv', paper: arxiv }
  }
  const bibliographic = [query.title, query.authors, query.year].filter(Boolean).join(' ')
  const works = await fetchText(
    fetchUrl,
    `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(bibliographic.slice(0, 600))}&rows=${RESULTS}`,
    'application/json'
  )
  const crossref = parseCrossrefSearch(JSON.parse(works)).find((paper) =>
    isConfidentTitleMatch(query, { title: paper.title, year: paper.year, authors: paper.authors })
  )
  return crossref ? { source: 'crossref', paper: crossref } : null
}
