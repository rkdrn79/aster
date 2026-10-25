import type { BibtexEntry } from '../../shared/research/bibtex-entry-reader'
import type { ResearchProjectLibraryPdf } from '../../shared/research/research-project-library-api'

export type ResearchLibraryPdfFile = Pick<
  ResearchProjectLibraryPdf,
  'path' | 'bytes' | 'modifiedAt'
>

type PdfMatch = Pick<ResearchProjectLibraryPdf, 'entryKey' | 'matchedBy'>

// Why 3: shorter keys (`a`, `li`) would match unrelated words in file names.
const MIN_KEY_CHARS = 3

/** Paths in a `file` field: JabRef's `desc:path:type;...`, or plain `;`-separated paths. */
function fileFieldPaths(file: string | undefined): string[] {
  return (file ?? '').split(';').flatMap((part) => {
    const pieces = part.split(':')
    const path = (pieces.length >= 3 ? pieces.slice(1, -1).join(':') : part)
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .toLowerCase()
    return path.endsWith('.pdf') ? [path] : []
  })
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase()
}

function containsBounded(text: string, word: string): boolean {
  for (let index = text.indexOf(word); index !== -1; index = text.indexOf(word, index + 1)) {
    const before = text[index - 1] ?? ''
    const after = text[index + word.length] ?? ''
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      return true
    }
  }
  return false
}

/** The longest entry key that appears in a file name as a whole word. */
function keyFinder(entries: readonly BibtexEntry[]): (stem: string) => string | null {
  const byToken = new Map<string, string>()
  const punctuated: string[] = []
  for (const { key } of entries) {
    const lower = key.toLowerCase()
    if (lower.length < MIN_KEY_CHARS) {
      continue
    }
    if (/^[a-z0-9]+$/.test(lower)) {
      byToken.set(lower, key)
    } else {
      punctuated.push(key)
    }
  }
  return (stem) => {
    const found = [
      // Why tokens: an alphanumeric key is a whole word exactly when it equals one of the name's.
      ...stem.split(/[^a-z0-9]+/).flatMap((token) => byToken.get(token) ?? []),
      ...punctuated.filter((key) => containsBounded(stem, key.toLowerCase()))
    ]
    return found.reduce<string | null>(
      (best, key) => (!best || key.length > best.length ? key : best),
      null
    )
  }
}

/**
 * Each PDF goes to at most one entry: the one whose `file` field names it, else the one whose key
 * appears in its name. An entry may own several PDFs (paper and supplement).
 */
export function matchResearchLibraryPdfs(
  entries: readonly BibtexEntry[],
  pdfs: readonly ResearchLibraryPdfFile[]
): { byPdf: Map<string, PdfMatch>; pdfsByKey: Map<string, string[]> } {
  const byPdf = new Map<string, PdfMatch>()
  const pdfsByKey = new Map<string, string[]>()
  const assign = (path: string, key: string, matchedBy: PdfMatch['matchedBy']): void => {
    if (byPdf.has(path)) {
      return
    }
    byPdf.set(path, { entryKey: key, matchedBy })
    pdfsByKey.set(key, [...(pdfsByKey.get(key) ?? []), path])
  }
  const byBasename = new Map<string, ResearchLibraryPdfFile[]>()
  for (const pdf of pdfs) {
    const name = basename(pdf.path)
    byBasename.set(name, [...(byBasename.get(name) ?? []), pdf])
  }
  for (const entry of entries) {
    for (const named of fileFieldPaths(entry.fields.file)) {
      const candidates = byBasename.get(basename(named)) ?? []
      // Why a unique basename suffices: Zotero and JabRef store absolute or library-relative paths.
      const exact = candidates.find((pdf) => pdf.path.toLowerCase().endsWith(`/${named}`))
      const match = exact ?? (candidates.length === 1 ? candidates[0] : undefined)
      if (match) {
        assign(match.path, entry.key, 'file-field')
      }
    }
  }
  const findKey = keyFinder(entries)
  for (const pdf of pdfs) {
    if (byPdf.has(pdf.path)) {
      continue
    }
    const key = findKey(basename(pdf.path).replace(/\.pdf$/, ''))
    if (key) {
      assign(pdf.path, key, 'key-in-name')
    }
  }
  return { byPdf, pdfsByKey }
}
