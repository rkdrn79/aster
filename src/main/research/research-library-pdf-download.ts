import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { arxivPdfFileName, parseArxivReference } from '../../shared/research/research-library-arxiv'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'
import { readCatalog } from '../../research-harness/research-catalog.mjs'
import { layoutRelativePaths } from '../../research-harness/research-layout.mjs'

const DOWNLOAD_TIMEOUT_MS = 90_000
const MAX_PDF_BYTES = 64 * 1024 * 1024

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

/** Writes once without overwriting; an identical existing PDF is reused. */
export async function writeLibraryPaperFile(
  root: string,
  fileName: string,
  bytes: Uint8Array
): Promise<string> {
  const folder = await papersRelativeDirectory(root)
  const canonicalRoot = await realpath(root)
  let directory = canonicalRoot
  for (const part of folder.split('/')) {
    const next = join(directory, part)
    await mkdir(next).catch((error: unknown) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error
      }
    })
    directory = await realpath(next)
    if (!isDescendantOrEqual(directory, canonicalRoot)) {
      throw new Error(`${folder} must be a folder inside the project.`)
    }
  }
  const extension = extname(fileName)
  const stem = fileName.slice(0, fileName.length - extension.length)
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const name = attempt === 1 ? fileName : `${stem}-${attempt}${extension}`
    const target = join(directory, name)
    try {
      await writeFile(target, bytes, { flag: 'wx' })
      return `${folder}/${name}`
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error
      }
      const existing = await lstat(target)
      if (existing.isFile() && existing.size === bytes.length) {
        const content = await readFile(target)
        if (content.equals(bytes)) {
          return `${folder}/${name}`
        }
      }
    }
  }
  throw new Error('Too many PDFs share this name. Rename the file and import it again.')
}

export async function downloadArxivPdfToWorkspace(
  root: string,
  reference: string,
  fetchPdf: (url: string, init: RequestInit) => Promise<Response> = fetch
): Promise<{ relativePath: string }> {
  const arxivId = parseArxivReference(reference)
  if (!arxivId) {
    throw new Error('The arXiv ID is invalid.')
  }
  const response = await fetchPdf(`https://arxiv.org/pdf/${arxivId}`, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`The arXiv PDF could not be downloaded (HTTP ${response.status}).`)
  }
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_PDF_BYTES) {
    throw new Error('The arXiv PDF is larger than 64 MiB.')
  }
  if (!response.body) {
    throw new Error('arXiv did not return a PDF.')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let finished = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        finished = true
        break
      }
      size += value.length
      if (size > MAX_PDF_BYTES) {
        throw new Error('The arXiv PDF is larger than 64 MiB.')
      }
      chunks.push(value)
    }
  } finally {
    if (!finished) {
      await reader.cancel().catch(() => {})
    }
  }
  const bytes = Buffer.concat(chunks, size)
  if (bytes.length < 5 || bytes.toString('latin1', 0, 5) !== '%PDF-') {
    throw new Error('arXiv did not return a PDF. Open the paper page and try again later.')
  }
  return { relativePath: await writeLibraryPaperFile(root, arxivPdfFileName(arxivId), bytes) }
}
