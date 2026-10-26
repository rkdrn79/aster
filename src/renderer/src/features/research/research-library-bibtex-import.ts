import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  isPaperInScope,
  type LibraryPaper,
  type LibraryScope
} from '../../../../shared/research/research-library'
import {
  readBibtexEntries,
  type BibtexEntry
} from '../../../../shared/research/bibtex-entry-reader'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import { parseArxivReference } from '../../../../shared/research/research-library-arxiv'
import { readResearchTextFile, researchFileExists } from './research-file-reader'
import { useResearchLibrary } from './research-library-store'
import { canDownloadLibraryPdf, downloadLibraryArxivPdf } from './research-library-pdf-download'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'

const BIBLIOGRAPHY_CANDIDATES = ['paper/main.bib', 'paper/references.bib', 'references.bib']
const MAX_BIB_BYTES = 4 * 1024 * 1024
const MAX_ENTRIES = 2_000
const MAX_PDFS_PER_IMPORT = 50
const DOWNLOAD_CONCURRENCY = 2

export function bibtexArxivId(entry: BibtexEntry): string | null {
  for (const value of [entry.fields.eprint, entry.fields.url]) {
    const id = value ? parseArxivReference(value) : null
    if (id) {
      return id
    }
  }
  const citation = [entry.fields.journal, entry.fields.note, entry.fields.howpublished]
    .filter(Boolean)
    .join(' ')
  const inline = citation.match(/\barxiv\s*:\s*([^\s,;}]+)/i)
  return inline ? parseArxivReference(inline[1]) : null
}

function httpUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 4096) {
    return undefined
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function paperFromBibtex(
  scope: LibraryScope,
  entry: BibtexEntry,
  now: string
): LibraryPaper | null {
  const title = entry.fields.title?.trim().slice(0, 500)
  if (!title || !entry.key.trim()) {
    return null
  }
  const year = Number(entry.fields.year)
  const url = httpUrl(entry.fields.url?.trim())
  const arxivId = bibtexArxivId(entry)
  const venue = entry.fields.booktitle ?? entry.fields.journal ?? entry.fields.venue
  return {
    id: createBrowserUuid(),
    scope,
    title,
    bibtexKey: entry.key.slice(0, 256),
    ...(arxivId ? { arxivId } : {}),
    ...(entry.fields.author ? { authors: entry.fields.author.slice(0, 2000) } : {}),
    ...(Number.isInteger(year) && year >= 1000 && year <= 9999 ? { year } : {}),
    ...(venue ? { venue: venue.slice(0, 200) } : {}),
    ...(entry.fields.doi?.trim() ? { doi: entry.fields.doi.trim().slice(0, 256) } : {}),
    ...(url || arxivId ? { externalUrl: url ?? `https://arxiv.org/abs/${arxivId}` } : {}),
    tags: [],
    status: 'unread',
    createdAt: now,
    updatedAt: now
  }
}

export function papersFromBibtex(
  scope: LibraryScope,
  entries: readonly BibtexEntry[],
  existing: readonly LibraryPaper[],
  now: string
): LibraryPaper[] {
  const known = new Set(
    existing
      .filter((paper) => isPaperInScope(paper, scope) && paper.bibtexKey)
      .map((paper) => paper.bibtexKey)
  )
  const incoming: LibraryPaper[] = []
  for (const entry of entries) {
    const paper = paperFromBibtex(scope, entry, now)
    if (!paper || known.has(paper.bibtexKey)) {
      continue
    }
    known.add(paper.bibtexKey)
    incoming.push(paper)
  }
  return incoming
}

export type BibliographyImportProgress = { completed: number; total: number; downloaded: number }

export async function importProjectBibliography(
  scope: LibraryScope,
  onProgress?: (progress: BibliographyImportProgress) => void
): Promise<{
  path: string
  added: number
  downloaded: number
  failed: number
  notAttempted: number
  noDownloadSource: number
  firstFailure: string | null
  malformed: number
  truncated: boolean
}> {
  const path = await (async () => {
    for (const candidate of BIBLIOGRAPHY_CANDIDATES) {
      if (await researchFileExists(scope, resolveRuntimePath(scope.workspacePath, candidate))) {
        return candidate
      }
    }
    return null
  })()
  if (!path) {
    throw new Error('No project bibliography was found. Add a .bib file under paper/ first.')
  }
  const content = await readResearchTextFile(
    scope,
    resolveRuntimePath(scope.workspacePath, path),
    MAX_BIB_BYTES
  )
  const parsed = readBibtexEntries(content, MAX_ENTRIES)
  const now = new Date().toISOString()
  let added = 0
  await useResearchLibrary.getState().update((current) => {
    const incoming = papersFromBibtex(scope, parsed.entries, current.papers, now)
    added = incoming.length
    return { ...current, papers: [...current.papers, ...incoming] }
  })
  const arxivByKey = new Map(
    parsed.entries.flatMap((entry) => {
      const id = bibtexArxivId(entry)
      return id ? [[entry.key, id] as const] : []
    })
  )
  const scopedPapers = (useResearchLibrary.getState().document?.papers ?? []).filter((paper) =>
    isPaperInScope(paper, scope)
  )
  const missingPdfKeys = new Set(
    scopedPapers
      .filter((paper) => !paper.pdfPath && paper.bibtexKey)
      .map((paper) => paper.bibtexKey)
  )
  const noDownloadSource = parsed.entries.filter(
    (entry) => !arxivByKey.has(entry.key) && missingPdfKeys.has(entry.key)
  ).length
  const eligible = canDownloadLibraryPdf(scope)
    ? scopedPapers.filter(
        (paper) =>
          !paper.pdfPath && paper.bibtexKey !== undefined && arxivByKey.has(paper.bibtexKey)
      )
    : []
  const candidates = eligible.slice(0, MAX_PDFS_PER_IMPORT)
  let next = 0
  let completed = 0
  let downloaded = 0
  let failed = 0
  let firstFailure: string | null = null
  let serverUpdateRequired = false
  onProgress?.({ completed, total: candidates.length, downloaded })
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, candidates.length) }, async () => {
      for (;;) {
        if (serverUpdateRequired) {
          return
        }
        const paper = candidates[next++]
        if (!paper?.bibtexKey) {
          return
        }
        const arxivId = arxivByKey.get(paper.bibtexKey)
        if (!arxivId) {
          continue
        }
        try {
          const { relativePath } = await downloadLibraryArxivPdf(scope, arxivId)
          await useResearchLibrary.getState().update((current) => ({
            ...current,
            papers: current.papers.map((entry) => {
              const samePaper = entry.id === paper.id
              const sameUnkeyedTitle =
                isPaperInScope(entry, scope) &&
                !entry.bibtexKey &&
                entry.title.trim().toLocaleLowerCase() === paper.title.trim().toLocaleLowerCase()
              return (samePaper || sameUnkeyedTitle) && !entry.pdfPath
                ? {
                    ...entry,
                    arxivId: entry.arxivId ?? arxivId,
                    pdfPath: relativePath,
                    updatedAt: new Date().toISOString()
                  }
                : entry
            })
          }))
          downloaded += 1
        } catch (error) {
          failed += 1
          if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
            serverUpdateRequired = true
            firstFailure = 'Update the workspace server to download Library PDFs.'
          } else {
            firstFailure ??= error instanceof Error ? error.message : String(error)
          }
        }
        completed += 1
        onProgress?.({ completed, total: candidates.length, downloaded })
      }
    })
  )
  return {
    path,
    added,
    downloaded,
    failed,
    notAttempted: eligible.length - completed,
    noDownloadSource,
    firstFailure,
    malformed: parsed.malformed,
    truncated: parsed.truncated
  }
}
