import { ARXIV_ID_PATTERN } from '../../../../shared/research/research-library'

/** A pdf.js text run reduced to what the heuristics read; `transform` is the 6-number matrix. */
export type PdfTextRun = { str: string; transform: readonly number[] }

export type PdfPaperIdentifiers = { arxivId: string | null; doi: string | null }

// Why: word processors and LaTeX drivers fill Title with these when the author never set one.
const PLACEHOLDER_TITLE =
  /^(?:untitled|title|document|paper|manuscript|slides?|main|article|arxiv|microsoft word\b.*|.*\.(?:pdf|docx?|tex|dvi|ps))$/i
const PLACEHOLDER_AUTHOR = /^(?:author|authors|user|admin|administrator|unknown|anonymous|owner)$/i
const MIN_TITLE_CHARS = 8
const MAX_TITLE_CHARS = 300
const SIZES_TRIED = 3

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function looksLikeFileName(value: string): boolean {
  return !/\s/.test(value) && /[_.-]/.test(value)
}

/** The PDF's Title entry when it reads like a real title rather than a file name or placeholder. */
export function usablePdfInfoTitle(title: unknown, fileStem: string): string | null {
  if (typeof title !== 'string') {
    return null
  }
  const value = collapse(title)
  const stem = collapse(fileStem.replace(/[_]+/g, ' '))
  if (
    value.length < MIN_TITLE_CHARS ||
    value.length > MAX_TITLE_CHARS ||
    PLACEHOLDER_TITLE.test(value) ||
    looksLikeFileName(value) ||
    value.toLowerCase() === stem.toLowerCase()
  ) {
    return null
  }
  return value
}

export function usablePdfInfoAuthors(author: unknown): string | null {
  if (typeof author !== 'string') {
    return null
  }
  const value = collapse(author)
  return value.length >= 2 && /\p{L}/u.test(value) && !PLACEHOLDER_AUTHOR.test(value)
    ? value.slice(0, 2000)
    : null
}

/** The year of a PDF date such as `D:20170612034710Z`, or of an ISO date. */
export function pdfDateYear(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = /^(?:D:)?(\d{4})/.exec(value.trim())
  const year = match ? Number(match[1]) : Number.NaN
  return year >= 1900 && year <= 9999 ? year : null
}

function runSize(run: PdfTextRun): number {
  return Math.round(Math.abs(run.transform[3] ?? 0) * 10) / 10
}

function isHorizontal(run: PdfTextRun): boolean {
  return Math.abs(run.transform[1] ?? 0) < 0.01 && Math.abs(run.transform[2] ?? 0) < 0.01
}

/**
 * The largest-font text in the top part of page 1, read top to bottom and joined across lines.
 * A size whose text is too short to be a title (a logo letter, a page number) yields to the next.
 */
export function titleFromFirstPage(runs: readonly PdfTextRun[], pageHeight: number): string | null {
  const candidates = runs.filter(
    (run) =>
      run.str.trim().length > 0 &&
      isHorizontal(run) &&
      runSize(run) > 0 &&
      (pageHeight <= 0 || (run.transform[5] ?? 0) >= pageHeight * 0.35)
  )
  const sizes = [...new Set(candidates.map(runSize))].sort((a, b) => b - a)
  for (const size of sizes.slice(0, SIZES_TRIED)) {
    const sized = candidates
      .filter((run) => Math.abs(runSize(run) - size) < 0.6)
      .toSorted(
        (a, b) =>
          (b.transform[5] ?? 0) - (a.transform[5] ?? 0) ||
          (a.transform[4] ?? 0) - (b.transform[4] ?? 0)
      )
    // Why: only the first block counts; a running header in the same size sits far from the title.
    const block: PdfTextRun[] = []
    for (const run of sized) {
      const previous = block.at(-1)
      if (previous && (previous.transform[5] ?? 0) - (run.transform[5] ?? 0) > size * 2.2) {
        break
      }
      block.push(run)
    }
    const text = collapse(block.map((run) => run.str).join(' ')).replace(
      /(\p{L})- (\p{Ll})/gu,
      '$1$2'
    )
    if (text.length >= MIN_TITLE_CHARS && text.length <= MAX_TITLE_CHARS && /\s/.test(text)) {
      return text
    }
  }
  return null
}

const ARXIV_IN_TEXT = /arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i
const DOI_IN_TEXT = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i
const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/i

const REFERENCES_HEADING = /\s(?:References|REFERENCES|Bibliography|BIBLIOGRAPHY)\s/

/**
 * The first arXiv ID and DOI printed before any reference list; an arXiv DOI also yields its ID.
 */
export function findPaperIdentifiers(fullText: string): PdfPaperIdentifiers {
  const text = fullText.split(REFERENCES_HEADING)[0] ?? ''
  const arxivMatch = ARXIV_IN_TEXT.exec(text)?.[1] ?? null
  const doi = DOI_IN_TEXT.exec(text)?.[1]?.replace(/[.,;:)\]}]+$/, '') ?? null
  const fromDoi = doi ? (ARXIV_DOI.exec(doi)?.[1] ?? null) : null
  const arxivId = [arxivMatch, fromDoi].find(
    (candidate): candidate is string => candidate !== null && ARXIV_ID_PATTERN.test(candidate)
  )
  return { arxivId: arxivId ?? null, doi: doi && doi.length <= 256 ? doi : null }
}
