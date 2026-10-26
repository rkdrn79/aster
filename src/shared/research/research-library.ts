import { z } from 'zod'
import { isManuscriptPathInsideWorkspace } from './research-records'

/** The project workspace a paper belongs to; its PDF lives inside this folder. */
export const libraryScopeSchema = z
  .object({
    hostId: z.string().min(1),
    workspaceId: z.string().min(1),
    workspacePath: z.string().min(1).max(4096)
  })
  .strict()

export const ARXIV_ID_PATTERN = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/

export const paperReadingStatusSchema = z.enum(['unread', 'reading', 'read'])

export const libraryPaperSchema = z
  .object({
    id: z.string().uuid(),
    scope: libraryScopeSchema,
    title: z.string().trim().min(1).max(500),
    authors: z.string().trim().max(2000).optional(),
    year: z.number().int().min(1000).max(9999).optional(),
    venue: z.string().trim().max(200).optional(),
    abstract: z.string().trim().max(20_000).optional(),
    arxivId: z.string().regex(ARXIV_ID_PATTERN).optional(),
    doi: z.string().trim().min(1).max(256).optional(),
    bibtexKey: z.string().trim().min(1).max(256).optional(),
    externalUrl: z
      .url()
      .regex(/^https?:\/\//i)
      .max(4096)
      .optional(),
    /** Workspace-relative path, usually under research/references/papers/. */
    pdfPath: z.string().min(1).max(4096).optional(),
    notes: z.string().max(50_000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    status: paperReadingStatusSchema.default('unread'),
    createdAt: z.string(),
    updatedAt: z.string()
  })
  .strict()

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const

/** A rectangle as fractions of its page box, so it survives every zoom level. */
export const pageRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1)
  })
  .strict()

export const paperHighlightSchema = z
  .object({
    id: z.string().uuid(),
    paperId: z.string().uuid(),
    pageNumber: z.number().int().min(1),
    text: z.string().min(1).max(24_000),
    note: z.string().max(10_000).optional(),
    color: z.enum(HIGHLIGHT_COLORS),
    rects: z.array(pageRectSchema).max(400),
    createdAt: z.string()
  })
  .strict()

export const researchLibraryDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Missing in documents written before concurrent-window protection. */
    revision: z.number().int().nonnegative().optional(),
    papers: z.array(libraryPaperSchema).max(10_000),
    highlights: z.array(paperHighlightSchema).max(100_000),
    /** Reading chat per workspace scope key; see libraryScopeKey. */
    readingAgentSessionByScope: z.record(z.string(), z.string().trim().min(1).max(256)),
    /** Papers once stored per Experiment in research.json were copied in once. */
    legacyPapersImported: z.boolean()
  })
  .strict()
  .superRefine((document, context) => {
    const paperIds = new Set(document.papers.map((paper) => paper.id))
    if (paperIds.size !== document.papers.length) {
      context.addIssue({ code: 'custom', path: ['papers'], message: 'Duplicate Paper ID' })
    }
    const highlightIds = new Set(document.highlights.map((highlight) => highlight.id))
    if (highlightIds.size !== document.highlights.length) {
      context.addIssue({ code: 'custom', path: ['highlights'], message: 'Duplicate highlight ID' })
    }
    for (const [index, paper] of document.papers.entries()) {
      if (
        paper.pdfPath &&
        !isManuscriptPathInsideWorkspace(paper.scope.workspacePath, paper.pdfPath, '.pdf')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['papers', index, 'pdfPath'],
          message: 'Paper PDF must be inside its project workspace'
        })
      }
    }
    for (const [index, highlight] of document.highlights.entries()) {
      if (!paperIds.has(highlight.paperId)) {
        context.addIssue({
          code: 'custom',
          path: ['highlights', index, 'paperId'],
          message: 'Highlight paper is missing'
        })
      }
    }
  })

export type LibraryScope = z.infer<typeof libraryScopeSchema>
export type LibraryPaper = z.infer<typeof libraryPaperSchema>
export type PaperReadingStatus = z.infer<typeof paperReadingStatusSchema>
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]
export type PageRect = z.infer<typeof pageRectSchema>
export type PaperHighlight = z.infer<typeof paperHighlightSchema>
export type ResearchLibraryDocument = z.infer<typeof researchLibraryDocumentSchema>

export function emptyResearchLibraryDocument(): ResearchLibraryDocument {
  return {
    schemaVersion: 1,
    revision: 0,
    papers: [],
    highlights: [],
    readingAgentSessionByScope: {},
    legacyPapersImported: false
  }
}

/** Same shape as research.json's selectedExperimentByWorkspace keys. */
export function libraryScopeKey(scope: Pick<LibraryScope, 'hostId' | 'workspaceId'>): string {
  return JSON.stringify([scope.hostId, scope.workspaceId])
}

export function isPaperInScope(paper: LibraryPaper, scope: LibraryScope): boolean {
  return paper.scope.hostId === scope.hostId && paper.scope.workspaceId === scope.workspaceId
}

export type ArxivPaperMetadata = {
  arxivId: string
  title: string
  authors: string[]
  abstract: string
  published: string
  year: number | null
  primaryCategory: string | null
  doi: string | null
  journalRef: string | null
  absUrl: string
  pdfUrl: string
}

export type LibraryPdfImportResult =
  | { status: 'imported'; relativePath: string; fileStem: string }
  | { status: 'cancelled' }
