import { z } from 'zod'
import { WorktreeSelector } from '../rpc-contract/files-target-params'
import { paperReadingStatusSchema, type PaperReadingStatus } from './research-library'
import type { RESEARCH_PROJECT_API_VERSION, ResearchProjectFile } from './research-project-api'

export const ResearchProjectLibraryReadParams = WorktreeSelector.extend({})
export const ResearchProjectDownloadArxivPdfParams = WorktreeSelector.extend({
  reference: z.string().trim().min(1).max(4096)
})

const nullableText = z.string().nullable().catch(null)

/**
 * research/references/library.json, the server-owned paper metadata of ADR-003. Read tolerantly:
 * a paper is matched to a BibTeX entry by `key`, else by its project-relative `pdfPath`.
 */
export const researchProjectLibraryMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  papers: z
    .array(
      z
        .object({
          key: nullableText,
          pdfPath: nullableText,
          status: paperReadingStatusSchema.nullable().catch(null),
          tags: z.array(z.string()).catch([]),
          notes: nullableText
        })
        .nullable()
        .catch(null)
    )
    .catch([])
})

export type ResearchProjectLibraryEntry = {
  /** The BibTeX citation key. */
  key: string
  /** The BibTeX entry type, lower-case: `article`, `inproceedings`, ... */
  type: string
  title: string | null
  authors: string | null
  /** As written; BibTeX years are text (`2024a`, `in press`). */
  year: string | null
  /** `booktitle`, else `journal`, else `venue`. */
  venue: string | null
  url: string | null
  doi: string | null
  /** The raw `file` field (JabRef `desc:path:type`, Zotero or plain paths). */
  file: string | null
  /** Project-relative PDFs under the papers folder matched to this entry. */
  pdfs: string[]
  /** From library.json; null and empty when it has no metadata for the entry. */
  status: PaperReadingStatus | null
  tags: string[]
  notes: string | null
}

export type ResearchProjectLibraryPdf = {
  /** Project-relative; read its bytes with `files.stat` and `files.readChunk`. */
  path: string
  bytes: number
  modifiedAt: string
  /** The entry this PDF belongs to; null for an unmatched PDF. */
  entryKey: string | null
  matchedBy: 'file-field' | 'key-in-name' | null
}

export type ResearchProjectLibraryReadResult = {
  version: typeof RESEARCH_PROJECT_API_VERSION
  /** From the harness catalog, else its layout defaults. */
  bibliographyPath: string
  papersPath: string
  bibliography: ResearchProjectFile<{
    entries: ResearchProjectLibraryEntry[]
    /** Entries skipped because their BibTeX could not be read. */
    malformedEntries: number
    /** The file or its entry count was over the read cap; later entries are missing. */
    truncated: boolean
  }>
  /** Every PDF under the papers folder, matched or not, newest first. */
  papers: ResearchProjectFile<{ pdfs: ResearchProjectLibraryPdf[]; truncated: boolean }>
  /** research/references/library.json; `absent` until something writes it. */
  metadata: ResearchProjectFile<{ papers: number }>
  readAt: string
}
