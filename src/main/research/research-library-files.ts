import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, relative, sep } from 'node:path'
import { net } from 'electron'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import { downloadArxivPdfToWorkspace, writeLibraryPaperFile } from './research-library-pdf-download'

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

function safePdfFileName(sourcePath: string): string {
  const stem = basename(sourcePath, extname(sourcePath))
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 120)
  return `${stem || 'paper'}.pdf`
}

export async function downloadArxivPdf(
  workspacePath: string,
  reference: string
): Promise<{ relativePath: string }> {
  const root = await workspaceRoot(workspacePath)
  return downloadArxivPdfToWorkspace(root, reference, (url, init) => net.fetch(url, init))
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
  return {
    relativePath: await writeLibraryPaperFile(root, safePdfFileName(source), bytes),
    fileStem
  }
}
