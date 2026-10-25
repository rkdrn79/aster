import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { parseHostAuthorityKey } from '../../shared/host-authority'
import type {
  ResearchSynctexPdfParams,
  ResearchSynctexPdfResult,
  ResearchSynctexRangesParams,
  ResearchSynctexRangesResult,
  ResearchSynctexSourceParams,
  ResearchSynctexSourceResult
} from '../../preload/api/research-synctex-bridge'
import { isDescendantOrEqual } from '../ipc/filesystem-path-containment'
import { resolveLocalRequestPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import { readResearchDocument } from './research-repository'
import {
  parseSynctex,
  synctexSourceAt,
  synctexSourceRanges,
  type SynctexDocument
} from './research-synctex'
import { synctexPdfLocation } from './research-synctex-forward'

const MAX_SYNCTEX_BYTES = 64 * 1024 * 1024
const pdfTarget = {
  experimentId: z.string().uuid(),
  pdfPath: z.string().min(1).max(4096),
  pageNumber: z.number().int().min(1).max(100_000)
}
const coordinate = z.number().finite()
const sourceAtSchema = z.object({ ...pdfTarget, x: coordinate, y: coordinate }).strict()
const rangesSchema = z
  .object({
    ...pdfTarget,
    rects: z
      .array(
        z.object({ x: coordinate, y: coordinate, width: coordinate, height: coordinate }).strict()
      )
      .min(1)
      .max(400)
  })
  .strict()
const pdfAtSchema = z
  .object({
    experimentId: pdfTarget.experimentId,
    pdfPath: pdfTarget.pdfPath,
    sourcePath: z.string().min(1).max(4096),
    line: z.number().int().min(1).max(10_000_000)
  })
  .strict()

type Failure = { status: 'unavailable' | 'no-match' | 'error'; message: string }
type OpenSynctex = {
  document: SynctexDocument
  workspacePath: string
  realWorkspace: string
  builtAtMs: number
  access: { kind: string; workspacePath: string }
}

// One parsed file per PDF; a recompile changes its mtime and replaces it.
const parsed = new Map<string, { mtimeMs: number; document: SynctexDocument }>()

function isWorkspaceRelative(path: string, extension: string): boolean {
  return (
    !isAbsolute(path) &&
    !path.split(/[\\/]/).includes('..') &&
    extname(path).toLowerCase() === extension
  )
}

async function readSynctex(path: string, mtimeMs: number): Promise<SynctexDocument> {
  const cached = parsed.get(path)
  if (cached?.mtimeMs === mtimeMs) {
    return cached.document
  }
  const text = gunzipSync(await readFile(path), { maxOutputLength: MAX_SYNCTEX_BYTES }).toString(
    'utf8'
  )
  const document = parseSynctex(text)
  parsed.set(path, { mtimeMs, document })
  return document
}

/** The parsed SyncTeX map Aster's build left beside a workspace PDF, after access checks. */
async function openSynctex(experimentId: string, pdfPath: string): Promise<OpenSynctex | Failure> {
  const document = await readResearchDocument()
  const experiment = document.experiments.find((record) => record.id === experimentId)
  const authority = experiment ? parseHostAuthorityKey(experiment.hostId) : null
  if (!experiment || authority?.endpoint.kind !== 'self' || authority.at !== 'local') {
    return { status: 'unavailable', message: 'SyncTeX works for local workspaces only.' }
  }
  const store = mainProcessState.store
  if (!store) {
    return { status: 'error', message: 'Workspace storage is not ready. Try again after startup.' }
  }
  const { workspacePath } = experiment
  if (!isWorkspaceRelative(pdfPath, '.pdf')) {
    return { status: 'error', message: 'The PDF must be inside the Experiment workspace.' }
  }
  const access = { kind: 'research-workspace', workspacePath }
  const workspace = await resolveLocalRequestPath(workspacePath, access, store, 'read')
  const pdf = await resolveLocalRequestPath(resolve(workspacePath, pdfPath), access, store, 'read')
  const synctex = `${pdf.slice(0, -extname(pdf).length)}.synctex.gz`
  if (!isDescendantOrEqual(pdf, workspace) || !isDescendantOrEqual(synctex, workspace)) {
    return { status: 'error', message: 'The PDF must be inside the Experiment workspace.' }
  }
  const [pdfStat, synctexStat] = await Promise.all([stat(pdf), stat(synctex).catch(() => null)])
  // Why the second: a PDF rebuilt by another tool leaves an older map that points elsewhere.
  if (!synctexStat || synctexStat.mtimeMs + 1000 < pdfStat.mtimeMs) {
    return { status: 'unavailable', message: 'Compile the PDF in Aster to link it with the TeX.' }
  }
  return {
    document: await readSynctex(synctex, synctexStat.mtimeMs),
    workspacePath,
    // Tectonic records real paths, while the workspace may be registered through a symlink.
    realWorkspace: await realpath(workspace),
    builtAtMs: synctexStat.mtimeMs,
    access
  }
}

/** A recorded input as a workspace-relative .tex path, or null for class files and outsiders. */
async function workspaceTexPath(map: OpenSynctex, input: string): Promise<string | null> {
  const path = relative(map.realWorkspace, await realpath(input).catch(() => input))
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    return null
  }
  return extname(path).toLowerCase() === '.tex' ? path.split(sep).join('/') : null
}

function failed(error: unknown): Failure {
  return { status: 'error', message: error instanceof Error ? error.message : String(error) }
}

/** The workspace-relative .tex file and line behind a point in a PDF Aster compiled. */
export async function findResearchSynctexSource(
  params: ResearchSynctexSourceParams
): Promise<ResearchSynctexSourceResult> {
  try {
    const map = await openSynctex(params.experimentId, params.pdfPath)
    if ('status' in map) {
      return map
    }
    const hit = synctexSourceAt(map.document, params.pageNumber, params.x, params.y)
    const sourcePath = hit ? await workspaceTexPath(map, hit.input) : null
    if (!hit || !sourcePath) {
      return { status: 'no-match', message: 'No manuscript TeX is recorded at that spot.' }
    }
    return { status: 'ok', sourcePath, line: hit.line }
  } catch (error) {
    return failed(error)
  }
}

/** Line ranges behind selected PDF text, flagged stale when a file changed after the build. */
export async function findResearchSynctexRanges(
  params: ResearchSynctexRangesParams
): Promise<ResearchSynctexRangesResult> {
  try {
    const map = await openSynctex(params.experimentId, params.pdfPath)
    if ('status' in map) {
      return map
    }
    const ranges: { sourcePath: string; startLine: number; endLine: number }[] = []
    let stale = false
    for (const range of synctexSourceRanges(map.document, params.pageNumber, params.rects)) {
      const sourcePath = await workspaceTexPath(map, range.input)
      if (sourcePath) {
        ranges.push({ sourcePath, startLine: range.startLine, endLine: range.endLine })
        const changed = await stat(range.input).catch(() => null)
        stale ||= !changed || changed.mtimeMs > map.builtAtMs + 1000
      }
    }
    if (ranges.length === 0) {
      return { status: 'no-match', message: 'No manuscript TeX is recorded for that text.' }
    }
    return { status: 'ok', ranges, stale }
  } catch (error) {
    return failed(error)
  }
}

/** The PDF page and boxes where a TeX file's line was typeset. */
export async function findResearchSynctexPdf(
  params: ResearchSynctexPdfParams
): Promise<ResearchSynctexPdfResult> {
  try {
    const map = await openSynctex(params.experimentId, params.pdfPath)
    if ('status' in map) {
      return map
    }
    if (!isWorkspaceRelative(params.sourcePath, '.tex')) {
      return { status: 'error', message: 'The TeX file must be inside the Experiment workspace.' }
    }
    const store = mainProcessState.store
    const source = store
      ? await resolveLocalRequestPath(
          resolve(map.workspacePath, params.sourcePath),
          map.access,
          store,
          'read'
        )
      : null
    const realSource = source ? await realpath(source).catch(() => null) : null
    const inputs = new Set<number>()
    for (const [tag, input] of map.document.inputs) {
      if (realSource && (await realpath(input).catch(() => input)) === realSource) {
        inputs.add(tag)
      }
    }
    const location = inputs.size ? synctexPdfLocation(map.document, inputs, params.line) : null
    if (!location) {
      return { status: 'no-match', message: 'This TeX file is not in the last PDF build.' }
    }
    return { status: 'ok', ...location }
  } catch (error) {
    return failed(error)
  }
}

export function registerResearchSynctexIpcHandlers(): void {
  ipcMain.handle('researchSynctex:sourceAt', (_event, input: unknown) =>
    findResearchSynctexSource(sourceAtSchema.parse(input))
  )
  ipcMain.handle('researchSynctex:sourceRanges', (_event, input: unknown) =>
    findResearchSynctexRanges(rangesSchema.parse(input))
  )
  ipcMain.handle('researchSynctex:pdfAt', (_event, input: unknown) =>
    findResearchSynctexPdf(pdfAtSchema.parse(input))
  )
}
