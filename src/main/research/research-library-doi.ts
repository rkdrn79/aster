import { net } from 'electron'
import {
  parseCrossrefWork,
  parseDoiReference,
  type DoiPaperMetadata
} from '../../shared/research/research-library-doi'

const LOOKUP_TIMEOUT_MS = 20_000
const MAX_RESPONSE_CHARS = 1024 * 1024

/** Paper details for a DOI from Crossref; only ever called when the user asks to fill a paper. */
export async function lookupDoiPaper(reference: string): Promise<DoiPaperMetadata> {
  const doi = parseDoiReference(reference)
  if (!doi) {
    throw new Error('Enter a DOI such as 10.1145/3292500.3330701.')
  }
  // Why: the URL is built from a validated DOI so the renderer cannot make main fetch other hosts.
  const response = await net.fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
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
