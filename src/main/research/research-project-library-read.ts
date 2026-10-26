import { lstat, opendir } from 'node:fs/promises'
import { join } from 'node:path'
import { layoutRelativePaths, libraryPaths } from '../../research-harness/research-layout.mjs'
import { readBibtexEntries, type BibtexEntry } from '../../shared/research/bibtex-entry-reader'
import {
  RESEARCH_PROJECT_API_VERSION,
  type ResearchProjectFile
} from '../../shared/research/research-project-api'
import {
  researchProjectLibraryMetadataSchema,
  type ResearchProjectLibraryEntry,
  type ResearchProjectLibraryPdf,
  type ResearchProjectLibraryReadResult
} from '../../shared/research/research-project-library-api'
import { isENOENT } from '../ipc/filesystem-path-containment'
import { normalizeRuntimeRelativePath } from '../runtime/runtime-relative-paths'
import { readResearchProjectCatalog } from './research-project-catalog-read'
import {
  parseResearchProjectFile,
  readResearchProjectBytes,
  readResearchProjectJson,
  researchProjectRelativePath,
  resolveResearchWorkspacePath,
  unreadableResearchProjectFile,
  type ResearchProjectRoot
} from './research-project-files'
import { matchResearchLibraryPdfs, type ResearchLibraryPdfFile } from './research-library-pdf-match'

const BIBLIOGRAPHY_MAX_BYTES = 4 * 1024 * 1024
const METADATA_MAX_BYTES = 4 * 1024 * 1024
const MAX_ENTRIES = 2000
const MAX_PDFS = 2000
const MAX_FOLDERS = 500
const MAX_FOLDER_DEPTH = 4
// Why: the reply must stay well under the 4 MiB remote frame (remote-runtime-memory-limits.ts).
const ENTRY_REPLY_BUDGET_CHARS = 2_500_000
const NOTES_MAX_CHARS = 2000

type LibraryLocations = { bibliography: string; papers: string; metadata: string }

/**
 * Where this project keeps its library: the catalog names the bib (it may be an existing .bib) and
 * may name the papers folder; the harness layout places library.json and imported PDFs.
 */
function libraryLocations(
  root: ResearchProjectRoot,
  references: { bibliography: string | null; papers: string | null } | null
): LibraryLocations {
  const library = libraryPaths(root.path)
  return {
    bibliography: references?.bibliography ?? layoutRelativePaths(root.path).bibliography,
    papers: references?.papers ?? researchProjectRelativePath(root, library.papers),
    metadata: researchProjectRelativePath(root, library.library)
  }
}

function absentOrUnreadable(
  error: unknown
): { status: 'absent' } | { status: 'unreadable'; reason: string } {
  return isENOENT(error) ? { status: 'absent' } : unreadableResearchProjectFile(error)
}

function clip(value: string | undefined, maxChars: number): string | null {
  return value ? value.slice(0, maxChars) : null
}

async function readBibliography(
  root: ResearchProjectRoot,
  path: string
): Promise<ResearchProjectFile<{ entries: BibtexEntry[]; malformed: number; truncated: boolean }>> {
  try {
    const read = await readResearchProjectBytes(
      await resolveResearchWorkspacePath(root, path),
      BIBLIOGRAPHY_MAX_BYTES,
      'start'
    )
    if (!read) {
      return { status: 'absent' }
    }
    const parsed = readBibtexEntries(read.bytes.toString('utf8'), MAX_ENTRIES)
    return {
      status: 'present',
      value: { ...parsed, truncated: parsed.truncated || read.size > read.bytes.length }
    }
  } catch (error) {
    return absentOrUnreadable(error)
  }
}

async function existingBibliographyPath(
  root: ResearchProjectRoot,
  configured: string | null,
  fallback: string
): Promise<string> {
  if (configured) {
    return configured
  }
  for (const candidate of [fallback, 'paper/main.bib']) {
    try {
      if ((await lstat(await resolveResearchWorkspacePath(root, candidate))).isFile()) {
        return candidate
      }
    } catch {
      // Missing candidates do not prevent a project without a bibliography from opening.
    }
  }
  return fallback
}

/** PDFs under the papers folder, a few levels deep; symlinks are not followed. */
async function listPdfs(
  root: ResearchProjectRoot,
  papers: string
): Promise<ResearchProjectFile<{ files: ResearchLibraryPdfFile[]; truncated: boolean }>> {
  const files: ResearchLibraryPdfFile[] = []
  let truncated = false
  let folders = 0
  async function walk(directory: string, relative: string, depth: number): Promise<void> {
    // Why for-await: leaving the loop early closes the handle, and a huge folder is never read whole.
    for await (const entry of await opendir(directory)) {
      if (files.length >= MAX_PDFS) {
        truncated = true
        return
      }
      const childPath = join(directory, entry.name)
      const childRelative = `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (depth + 1 >= MAX_FOLDER_DEPTH || folders >= MAX_FOLDERS) {
          truncated = true
          continue
        }
        folders += 1
        await walk(childPath, childRelative, depth + 1).catch(() => undefined)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        const details = await lstat(childPath).catch(() => null)
        if (details) {
          files.push({
            path: childRelative,
            bytes: details.size,
            modifiedAt: details.mtime.toISOString()
          })
        }
      }
    }
  }
  try {
    const base = await resolveResearchWorkspacePath(root, papers)
    await walk(base, normalizeRuntimeRelativePath(papers, root.path), 0)
    return { status: 'present', value: { files, truncated } }
  } catch (error) {
    return absentOrUnreadable(error)
  }
}

type PaperMetadata = {
  status: ResearchProjectLibraryEntry['status']
  tags: string[]
  notes: string | null
}

async function readMetadata(
  root: ResearchProjectRoot,
  path: string
): Promise<
  ResearchProjectFile<{
    byKey: Map<string, PaperMetadata>
    byPdf: Map<string, PaperMetadata>
    papers: number
  }>
> {
  const file = parseResearchProjectFile(
    await readResearchProjectJson(root, path, METADATA_MAX_BYTES),
    researchProjectLibraryMetadataSchema,
    'library.json'
  )
  if (file.status !== 'present') {
    return file
  }
  const byKey = new Map<string, PaperMetadata>()
  const byPdf = new Map<string, PaperMetadata>()
  for (const paper of file.value.papers) {
    if (!paper) {
      continue
    }
    const metadata = {
      status: paper.status,
      tags: paper.tags.slice(0, 20),
      notes: clip(paper.notes ?? undefined, NOTES_MAX_CHARS)
    }
    if (paper.key) {
      byKey.set(paper.key, metadata)
    }
    if (paper.pdfPath) {
      byPdf.set(paper.pdfPath, metadata)
    }
  }
  return { status: 'present', value: { byKey, byPdf, papers: file.value.papers.length } }
}

/** library.bib parsed, the papers folder's PDFs matched to its entries, and library.json merged. */
export async function readResearchProjectLibrary(
  root: ResearchProjectRoot
): Promise<ResearchProjectLibraryReadResult> {
  const catalog = await readResearchProjectCatalog(root)
  const locations = libraryLocations(
    root,
    catalog.file.status === 'present' ? catalog.file.value.references : null
  )
  locations.bibliography = await existingBibliographyPath(
    root,
    catalog.file.status === 'present'
      ? (catalog.file.value.references?.bibliography ?? null)
      : null,
    locations.bibliography
  )
  const [bibliography, papers, metadata] = await Promise.all([
    readBibliography(root, locations.bibliography),
    listPdfs(root, locations.papers),
    readMetadata(root, locations.metadata)
  ])
  const bibEntries = bibliography.status === 'present' ? bibliography.value.entries : []
  const pdfFiles = papers.status === 'present' ? papers.value.files : []
  const matches = matchResearchLibraryPdfs(bibEntries, pdfFiles)
  const known = metadata.status === 'present' ? metadata.value : null

  const entries: ResearchProjectLibraryEntry[] = []
  let replyChars = 0
  let overBudget = false
  for (const entry of bibEntries) {
    const pdfs = matches.pdfsByKey.get(entry.key) ?? []
    const fields = entry.fields
    const paper =
      known?.byKey.get(entry.key) ??
      pdfs.map((pdf) => known?.byPdf.get(pdf)).find((found) => found !== undefined)
    const item: ResearchProjectLibraryEntry = {
      key: entry.key,
      type: entry.type,
      title: clip(fields.title, 500),
      authors: clip(fields.author, 2000),
      year: clip(fields.year, 32),
      venue: clip(fields.booktitle ?? fields.journal ?? fields.venue, 300),
      url: clip(fields.url, 2048),
      doi: clip(fields.doi, 256),
      file: clip(fields.file, 2048),
      pdfs,
      status: paper?.status ?? null,
      tags: paper?.tags ?? [],
      notes: paper?.notes ?? null
    }
    replyChars += JSON.stringify(item).length
    if (replyChars > ENTRY_REPLY_BUDGET_CHARS) {
      overBudget = true
      break
    }
    entries.push(item)
  }

  const pdfs: ResearchProjectLibraryPdf[] = pdfFiles
    .map((file) => ({
      ...file,
      ...(matches.byPdf.get(file.path) ?? { entryKey: null, matchedBy: null })
    }))
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
  return {
    version: RESEARCH_PROJECT_API_VERSION,
    bibliographyPath: locations.bibliography,
    papersPath: locations.papers,
    bibliography:
      bibliography.status === 'present'
        ? {
            status: 'present',
            value: {
              entries,
              malformedEntries: bibliography.value.malformed,
              truncated: bibliography.value.truncated || overBudget
            }
          }
        : bibliography,
    papers:
      papers.status === 'present'
        ? { status: 'present', value: { pdfs, truncated: papers.value.truncated } }
        : papers,
    metadata:
      metadata.status === 'present'
        ? { status: 'present', value: { papers: metadata.value.papers } }
        : metadata,
    readAt: new Date().toISOString()
  }
}
