import { createBrowserUuid } from '@/lib/browser-uuid'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import {
  isPaperInScope,
  type ArxivPaperMetadata,
  type HighlightColor,
  type LibraryPaper,
  type LibraryScope,
  type PaperHighlight
} from '../../../../shared/research/research-library'
import { parseArxivReference } from '../../../../shared/research/research-library-arxiv'
import { useResearchLibrary } from './research-library-store'
import type { PdfPaperMetadata } from './research-library-pdf-metadata'
import { readManuscriptPdf, resolveManuscriptFile } from './research-writing-source'

export const HIGHLIGHT_STYLES: Record<
  HighlightColor,
  { label: string; overlay: string; swatch: string }
> = {
  yellow: { label: 'Yellow', overlay: 'rgb(250 204 21 / 0.42)', swatch: 'rgb(250 204 21)' },
  green: { label: 'Green', overlay: 'rgb(74 222 128 / 0.38)', swatch: 'rgb(74 222 128)' },
  blue: { label: 'Blue', overlay: 'rgb(96 165 250 / 0.38)', swatch: 'rgb(96 165 250)' },
  pink: { label: 'Pink', overlay: 'rgb(244 114 182 / 0.38)', swatch: 'rgb(244 114 182)' }
}

function arxivBase(id: string): string {
  return id.replace(/v\d+$/, '')
}

export function findPaperByArxivId(
  papers: readonly LibraryPaper[],
  scope: LibraryScope,
  arxivId: string
): LibraryPaper | undefined {
  return papers.find(
    (paper) =>
      isPaperInScope(paper, scope) &&
      paper.arxivId !== undefined &&
      arxivBase(paper.arxivId) === arxivBase(arxivId)
  )
}

export function paperFromArxiv(
  scope: LibraryScope,
  metadata: ArxivPaperMetadata,
  pdfPath: string | undefined
): LibraryPaper {
  const now = new Date().toISOString()
  const authors = metadata.authors.join(', ').slice(0, 2000)
  return {
    id: createBrowserUuid(),
    scope,
    title: metadata.title.slice(0, 500),
    ...(authors ? { authors } : {}),
    ...(metadata.year ? { year: metadata.year } : {}),
    ...(metadata.journalRef ? { venue: metadata.journalRef.slice(0, 200) } : {}),
    ...(metadata.abstract ? { abstract: metadata.abstract.slice(0, 20_000) } : {}),
    arxivId: metadata.arxivId,
    ...(metadata.doi ? { doi: metadata.doi } : {}),
    externalUrl: metadata.absUrl,
    ...(pdfPath ? { pdfPath } : {}),
    tags: metadata.primaryCategory ? [metadata.primaryCategory] : [],
    status: 'unread',
    createdAt: now,
    updatedAt: now
  }
}

export async function addLibraryPaper(paper: LibraryPaper): Promise<void> {
  await useResearchLibrary.getState().update((current) => ({
    ...current,
    papers: [...current.papers, paper]
  }))
}

export async function updateLibraryPaper(
  paperId: string,
  change: (paper: LibraryPaper) => LibraryPaper
): Promise<void> {
  await useResearchLibrary.getState().update((current) => ({
    ...current,
    papers: current.papers.map((paper) =>
      paper.id === paperId ? { ...change(paper), updatedAt: new Date().toISOString() } : paper
    )
  }))
}

export async function removeLibraryPaper(paperId: string): Promise<void> {
  await useResearchLibrary.getState().update((current) => ({
    ...current,
    papers: current.papers.filter((paper) => paper.id !== paperId),
    highlights: current.highlights.filter((highlight) => highlight.paperId !== paperId)
  }))
}

export async function addPaperHighlight(
  paperId: string,
  selection: PdfTextSelection,
  color: HighlightColor
): Promise<string> {
  const highlight: PaperHighlight = {
    id: createBrowserUuid(),
    paperId,
    pageNumber: selection.pageNumber,
    text: selection.text,
    color,
    rects: selection.rects ?? [],
    createdAt: new Date().toISOString()
  }
  await useResearchLibrary.getState().update((current) => ({
    ...current,
    highlights: [...current.highlights, highlight]
  }))
  return highlight.id
}

export async function updatePaperHighlight(
  highlightId: string,
  change: Partial<Pick<PaperHighlight, 'note' | 'color'>>
): Promise<void> {
  await useResearchLibrary.getState().update((current) => ({
    ...current,
    highlights: current.highlights.map((highlight) => {
      if (highlight.id !== highlightId) {
        return highlight
      }
      const next = { ...highlight, ...change }
      if (!next.note?.trim()) {
        delete next.note
      }
      return next
    })
  }))
}

export async function removePaperHighlight(highlightId: string): Promise<void> {
  await useResearchLibrary.getState().update((current) => ({
    ...current,
    highlights: current.highlights.filter((highlight) => highlight.id !== highlightId)
  }))
}

export function titleFromFileStem(stem: string): string {
  return (
    stem
      .replace(/[_\s]+/g, ' ')
      .trim()
      .slice(0, 500) || 'Untitled paper'
  )
}

/** Reads the imported file's own metadata; an unreadable PDF still imports under its file name. */
async function readImportedPdfMetadata(
  scope: LibraryScope,
  relativePath: string,
  fileStem: string
): Promise<PdfPaperMetadata | null> {
  try {
    const pdf = await readManuscriptPdf(scope, resolveManuscriptFile(scope, relativePath, '.pdf'))
    const binary = window.atob(pdf.base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    // Why lazy: pdf.js loads only when a PDF is imported, as it does for the reader.
    const { readPdfPaperMetadata } = await import('./research-library-pdf-metadata')
    return await readPdfPaperMetadata(bytes, fileStem)
  } catch {
    return null
  }
}

/**
 * Imports a PDF; a file named like an arXiv ID also gets its arXiv metadata. Any other file is
 * titled from its own metadata or largest first-page text, never from the network.
 */
export async function importPdfPaper(scope: LibraryScope): Promise<LibraryPaper | null> {
  const result = await window.api.researchLibrary.importPdf({ workspacePath: scope.workspacePath })
  if (result.status !== 'imported') {
    return null
  }
  const papers = useResearchLibrary.getState().document?.papers ?? []
  const linked = papers.find(
    (paper) => isPaperInScope(paper, scope) && paper.pdfPath === result.relativePath
  )
  if (linked) {
    return linked
  }
  const arxivId = parseArxivReference(result.fileStem.replace(/_/g, '/'))
  if (arxivId) {
    try {
      const metadata = await window.api.researchLibrary.lookupArxiv({ reference: arxivId })
      const paper = paperFromArxiv(scope, metadata, result.relativePath)
      await addLibraryPaper(paper)
      return paper
    } catch {
      // Why: a filename that only looks like an arXiv ID still imports as a plain PDF.
    }
  }
  const metadata = await readImportedPdfMetadata(scope, result.relativePath, result.fileStem)
  const now = new Date().toISOString()
  const paper: LibraryPaper = {
    id: createBrowserUuid(),
    scope,
    title: metadata?.title?.slice(0, 500) ?? titleFromFileStem(result.fileStem),
    ...(metadata?.authors ? { authors: metadata.authors } : {}),
    ...(metadata?.year ? { year: metadata.year } : {}),
    // Why: identifiers printed in the PDF are kept so the user can fill details from them later.
    ...(metadata?.arxivId && !findPaperByArxivId(papers, scope, metadata.arxivId)
      ? { arxivId: metadata.arxivId }
      : {}),
    ...(metadata?.doi ? { doi: metadata.doi } : {}),
    pdfPath: result.relativePath,
    tags: [],
    status: 'unread',
    createdAt: now,
    updatedAt: now
  }
  await addLibraryPaper(paper)
  return paper
}
