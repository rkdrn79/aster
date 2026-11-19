import { plotFilePaths } from '../../../../research-harness/research-figures-plot-files.mjs'
import { bytesSha256 } from './research-figure-document'
import {
  PLOT_VERSION_FILES,
  figureHistoryFolder,
  keepFigureVersion,
  listFigureHistory,
  type FigureCheckpointKind,
  type FigureHistoryEntry
} from './research-figure-history'
import type { FigureTarget } from './research-figures-export'
import {
  base64ToBytes,
  deleteProjectPath,
  isMissingProjectFile,
  readProjectFile,
  writeProjectBinary,
  type ProjectFileOwner
} from './research-project-files'

type PlotFileKey = keyof typeof PLOT_VERSION_FILES
type PlotFiles = Partial<Record<PlotFileKey, Uint8Array>>

// Why a function: modules that mock History in their tests never reach a plot's files.
const plotKeys = (): PlotFileKey[] => ['script', 'manifest', 'pdf', 'svg', 'embed', 'png']

async function bytesOf(owner: ProjectFileOwner, path: string): Promise<Uint8Array | null> {
  try {
    const file = await readProjectFile(owner, path)
    return file.isBinary ? base64ToBytes(file.content) : new TextEncoder().encode(file.content)
  } catch (cause) {
    if (isMissingProjectFile(cause)) {
      return null
    }
    throw cause
  }
}

/** The plot's files as they are now: the script and what its last run wrote, when present. */
export async function readPlotFiles(target: FigureTarget): Promise<PlotFiles> {
  const paths = plotFilePaths(target.folder, target.slug)
  const read = await Promise.all(
    plotKeys().map(async (key) => [key, await bytesOf(target.owner, paths[key])] as const)
  )
  const files: PlotFiles = {}
  for (const [key, bytes] of read) {
    if (bytes) {
      files[key] = bytes
    }
  }
  return files
}

/** One hash for a plot's version: each kept file's own hash, in a fixed order. */
export async function plotVersionSha(files: PlotFiles): Promise<string> {
  const lines = await Promise.all(
    plotKeys().map(async (key) => {
      const bytes = files[key]
      return bytes ? `${key}:${await bytesSha256(bytes)}` : `${key}:-`
    })
  )
  return bytesSha256(new TextEncoder().encode(lines.join('\n')))
}

/**
 * Keeps a version of a plot (its script, PNG, PDF, SVGs and manifest) in its History, the PNG
 * doubling as the thumbnail. Null when there is nothing to keep or it could not be written; the
 * newest entry when nothing changed since it.
 */
export async function snapshotPlot(
  target: FigureTarget,
  input: { kind: FigureCheckpointKind; what: string }
): Promise<FigureHistoryEntry | null> {
  const files = await readPlotFiles(target).catch(() => null)
  if (!files || (!files.script && !files.manifest)) {
    return null
  }
  const { owner } = target
  const sha = await plotVersionSha(files).catch(() => null)
  if (!sha) {
    return null
  }
  return keepFigureVersion(owner, target.slug, {
    kind: input.kind,
    what: input.what,
    sha,
    write: async (folder, id) => {
      const kept: string[] = []
      let bytes = 0
      for (const key of plotKeys()) {
        const data = files[key]
        if (data) {
          await writeProjectBinary(owner, `${folder}/${id}${PLOT_VERSION_FILES[key]}`, data)
          kept.push(PLOT_VERSION_FILES[key])
          bytes += data.length
        }
      }
      return { bytes, thumbnail: Boolean(files.png), plot: kept }
    }
  })
}

/**
 * Puts a plot's version back: every file it kept is written over the plot's, and what the version
 * did not have of the run (a version from before its first run) is removed, so the page shows
 * what that version showed. The current files are kept first, so a restore loses nothing.
 */
export async function restorePlotSnapshot(
  target: FigureTarget,
  id: string
): Promise<string | null> {
  try {
    const { owner, slug } = target
    const entry = (await listFigureHistory(owner, slug)).find((item) => item.id === id)
    if (!entry || !Array.isArray(entry.plot)) {
      return 'That version is not one of this plot.'
    }
    const folder = await figureHistoryFolder(owner, slug)
    const kept: PlotFiles = {}
    for (const key of plotKeys()) {
      if (entry.plot.includes(PLOT_VERSION_FILES[key])) {
        const bytes = await bytesOf(owner, `${folder}/${id}${PLOT_VERSION_FILES[key]}`)
        if (!bytes) {
          return 'The version was not restored: its files are gone.'
        }
        kept[key] = bytes
      }
    }
    await snapshotPlot(target, {
      kind: 'before-restore',
      what: 'Before restoring an earlier version'
    })
    const paths = plotFilePaths(target.folder, slug)
    for (const key of plotKeys()) {
      const bytes = kept[key]
      if (bytes) {
        await writeProjectBinary(owner, paths[key], bytes)
      } else if (key !== 'script') {
        await deleteProjectPath(owner, paths[key]).catch(() => undefined)
      }
    }
    return null
  } catch (cause) {
    return `The version was not restored. ${cause instanceof Error ? cause.message : String(cause)}`
  }
}
