import type { FigureFolderListing } from './research-figures-model.mjs'

export const FIGURE_WORK_GITIGNORE: string
export function figureWorkFolder(recordRoot: string): string
export function paperCopyPath(manuscriptSource: string, slug: string): string
export function figurePublicationPath(recordRoot: string, slug: string): string

export type FigurePublication = {
  slug: string
  /** Project-relative path of the paper's copy. */
  pdf: string
  pdfSha256: string
  /** The scene the copy was made from; null for a plot, which has none. */
  sceneSha256: string | null
  publishedAt: string
}
export function publicationRecord(input: FigurePublication): FigurePublication
export function parsePublicationRecord(text: string): FigurePublication | null

export type FigureLocation = 'work' | 'paper'
export type ListedFigure = FigureFolderListing['figures'][number] & {
  folder: string
  location: FigureLocation
}
export type ListedFigureFile = FigureFolderListing['others'][number] & { folder: string }
export type FigureListing = {
  figures: ListedFigure[]
  others: ListedFigureFile[]
  /** Older figures with the same name as a working one: not opened, never touched. */
  shadowed: { slug: string; folder: string }[]
}
export function mergeFigureListings(input: {
  workFolder: string
  work: FigureFolderListing
  paperFolder: string
  paper: FigureFolderListing
}): FigureListing

export type FigurePaperState = 'beside' | 'none' | 'current' | 'outdated' | 'missing'
export function figurePaperState(input: {
  location: FigureLocation
  record: FigurePublication | null
  paperCopy: boolean
  expectedPdf: string
  sceneSha256: string | null
}): FigurePaperState
