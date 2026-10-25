import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import { net } from 'electron'
import type { ArxivPaperMetadata } from '../../shared/research/research-library'
import {
  arxivPdfFileName,
  parseArxivAtomFeed,
  parseArxivReference
} from '../../shared/research/research-library-arxiv'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import { readCatalog } from '../../research-harness/research-catalog.mjs'
import { layoutRelativePaths } from '../../research-harness/research-layout.mjs'

const LOOKUP_TIMEOUT_MS = 20_000
const DOWNLOAD_TIMEOUT_MS = 90_000
const MAX_FEED_CHARS = 1024 * 1024
const MAX_PDF_BYTES = 64 * 1024 * 1024

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-'
}

async function workspaceRoot(workspacePath: string): Promise<string> {
  const store = mainProcessState.store
  if (!store) {
    throw new Error('Project storage is not ready. Try again after startup.')
  }
  return realpath(await resolveDesktopAuthorizedPath(workspacePath, store))
}

/**
 * The catalog's `references.papers`, else the layout default (`.aster/library/papers`, or
 * `research/references/papers` in a pre-ADR-004 project). Project-relative with `/`.
 */
async function papersRelativeDirectory(root: string): Promise<string> {
  const catalog: unknown = await readCatalog(root).catch(() => null)
  const references =
    catalog && typeof catalog === 'object' && 'references' in catalog ? catalog.references : null
  const configured =
    references && typeof references === 'object' && 'papers' in references
      ? references.papers
      : null
  const folder =
    typeof configured === 'string' && configured ? configured : layoutRelativePaths(root).papers
  const parts = folder.split('/').filter(Boolean)
  if (!parts.length || folder.startsWith('/') || parts.includes('..') || folder.includes('\\')) {
    throw new Error(`The catalog's papers folder must be inside the project: ${folder}`)
  }
  return parts.join('/')
}

async function papersDirectory(root: string): Promise<{ directory: string; folder: string }> {
  const folder = await papersRelativeDirectory(root)
  const directory = join(root, ...folder.split('/'))
  await mkdir(directory, { recursive: true })
  const resolved = await realpath(directory)
  if (!isDescendantOrEqual(resolved, root)) {
    throw new Error(`${folder} must be a folder inside the project.`)
  }
  return { directory: resolved, folder }
}

async function sameBytes(path: string, bytes: Uint8Array): Promise<boolean> {
  const existing = await readFile(path)
  return existing.length === bytes.length && existing.equals(bytes)
}

/** Writes once without overwriting; an identical existing file is reused. */
async function writePaperFile(root: string, fileName: string, bytes: Uint8Array): Promise<string> {
  const { directory, folder: papers } = await papersDirectory(root)
  const extension = extname(fileName)
  const stem = fileName.slice(0, fileName.length - extension.length)
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const name = attempt === 1 ? fileName : `${stem}-${attempt}${extension}`
    const target = join(directory, name)
    try {
      await writeFile(target, bytes, { flag: 'wx' })
      return `${papers}/${name}`
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error
      }
      if ((await stat(target)).isFile() && (await sameBytes(target, bytes))) {
        return `${papers}/${name}`
      }
    }
  }
  throw new Error('Too many PDFs share this name. Rename the file and import it again.')
}

function safePdfFileName(sourcePath: string): string {
  const stem = basename(sourcePath, extname(sourcePath))
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 120)
  return `${stem || 'paper'}.pdf`
}

export async function lookupArxivPaper(reference: string): Promise<ArxivPaperMetadata> {
  const arxivId = parseArxivReference(reference)
  if (!arxivId) {
    throw new Error('Enter an arXiv ID such as 2410.12345, or an arXiv/alphaXiv link.')
  }
  const response = await net.fetch(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`,
    { headers: { Accept: 'application/atom+xml' }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) }
  )
  if (response.status === 429 || response.status === 503) {
    throw new Error('arXiv is rate limiting requests. Try again in a minute.')
  }
  if (!response.ok) {
    throw new Error(`arXiv lookup failed (HTTP ${response.status}).`)
  }
  const feed = await response.text()
  if (feed.length > MAX_FEED_CHARS) {
    throw new Error('arXiv returned an unexpectedly large response.')
  }
  const paper = parseArxivAtomFeed(feed)
  if (!paper) {
    throw new Error(`arXiv has no paper ${arxivId}.`)
  }
  return paper
}

export async function downloadArxivPdf(
  workspacePath: string,
  reference: string
): Promise<{ relativePath: string }> {
  const arxivId = parseArxivReference(reference)
  if (!arxivId) {
    throw new Error('The arXiv ID is invalid.')
  }
  const root = await workspaceRoot(workspacePath)
  // Why: the URL is built from a validated ID so the renderer cannot make main fetch arbitrary hosts.
  const response = await net.fetch(`https://arxiv.org/pdf/${arxivId}`, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`The arXiv PDF could not be downloaded (HTTP ${response.status}).`)
  }
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_PDF_BYTES) {
    throw new Error('The arXiv PDF is larger than 64 MiB.')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > MAX_PDF_BYTES || !isPdf(bytes)) {
    throw new Error('arXiv did not return a PDF. Open the paper page and try again later.')
  }
  return { relativePath: await writePaperFile(root, arxivPdfFileName(arxivId), bytes) }
}

/** A PDF already inside the project is linked in place; any other is copied into the papers folder. */
export async function importLocalPdf(
  workspacePath: string,
  sourcePath: string
): Promise<{ relativePath: string; fileStem: string }> {
  const root = await workspaceRoot(workspacePath)
  const source = await realpath(sourcePath)
  const info = await stat(source)
  if (!info.isFile()) {
    throw new Error('Choose a PDF file.')
  }
  if (info.size > MAX_PDF_BYTES) {
    throw new Error('The PDF is larger than 64 MiB.')
  }
  const bytes = await readFile(source)
  if (!isPdf(bytes)) {
    throw new Error('The chosen file is not a PDF.')
  }
  const fileStem = basename(source, extname(source))
  if (isDescendantOrEqual(source, root)) {
    return { relativePath: relative(root, source).split(sep).join('/'), fileStem }
  }
  return { relativePath: await writePaperFile(root, safePdfFileName(source), bytes), fileStem }
}
