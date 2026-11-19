import type { LibraryPaper, LibraryScope } from './research-library'

/** Lower-case words of a title with accents, LaTeX braces and punctuation dropped. */
export function normalizePaperTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\[a-zA-Z]+\s*/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function arxivIdBase(arxivId: string): string {
  return arxivId.replace(/v\d+$/, '').toLowerCase()
}

export type PaperIdentity = {
  arxivId?: string | null
  doi?: string | null
  title?: string | null
}

/** The Library paper in this scope that is the same work: same arXiv ID, DOI, or title. */
export function findLibraryPaperMatch(
  papers: readonly LibraryPaper[],
  scope: Pick<LibraryScope, 'hostId' | 'workspaceId'>,
  identity: PaperIdentity
): LibraryPaper | undefined {
  const arxiv = identity.arxivId ? arxivIdBase(identity.arxivId) : null
  const doi = identity.doi?.trim().toLowerCase() || null
  const title = identity.title ? normalizePaperTitle(identity.title) : null
  return papers.find(
    (paper) =>
      paper.scope.hostId === scope.hostId &&
      paper.scope.workspaceId === scope.workspaceId &&
      ((arxiv !== null && paper.arxivId !== undefined && arxivIdBase(paper.arxivId) === arxiv) ||
        (doi !== null && paper.doi?.trim().toLowerCase() === doi) ||
        (title !== null && title.length > 0 && normalizePaperTitle(paper.title) === title))
  )
}

function words(title: string): string[] {
  return normalizePaperTitle(title).split(' ').filter(Boolean)
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left)
  const b = new Set(right)
  let shared = 0
  for (const word of a) {
    if (b.has(word)) {
      shared += 1
    }
  }
  return shared / (a.size + b.size - shared || 1)
}

/** Family names a citation names: "Vaswani et al.", "Kingma and Ba", "Smith, J., Doe, K.". */
export function citedSurnames(authors: string): string[] {
  const cleaned = authors.replace(/\bet\s+al\.?/gi, ' ').replace(/\band\b|&/gi, ',')
  return cleaned.split(/[,;]/).flatMap((part) => {
    // "Smith J." / "J. Smith" / "Ashish Vaswani": the last word that is not an initial.
    const names = part
      .trim()
      .split(/\s+/)
      .map((token) => normalizePaperTitle(token))
      .filter((token) => token.length >= 2)
    const family = names.at(-1)
    return family ? [family] : []
  })
}

export type TitleQuery = {
  title: string
  year?: number | null
  authors?: string | null
  /** The title came from a URL slug that may end in author names (Semantic Scholar). */
  slug?: boolean
}

export type TitleCandidate = { title: string; year: number | null; authors: readonly string[] }

/**
 * True only when the candidate is clearly the cited paper: the same title (a slug may add author
 * names after it), and the year and first cited author agree whenever the citation gives them.
 */
export function isConfidentTitleMatch(query: TitleQuery, candidate: TitleCandidate): boolean {
  const asked = words(query.title)
  const found = words(candidate.title)
  if (found.length < 2 || asked.length < 2) {
    return false
  }
  const sameTitle = query.slug
    ? found.length >= 3 &&
      asked.length - found.length <= 4 &&
      found.every((word, index) => asked[index] === word)
    : asked.join(' ') === found.join(' ') || jaccard(asked, found) >= 0.9
  if (!sameTitle) {
    return false
  }
  if (query.year && candidate.year && Math.abs(query.year - candidate.year) > 1) {
    return false
  }
  const surnames = query.authors ? citedSurnames(query.authors) : []
  if (surnames.length && candidate.authors.length) {
    const named = normalizePaperTitle(candidate.authors.join(' '))
    return named.split(' ').includes(surnames[0])
  }
  return true
}
