import { create } from 'zustand'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { figureFileText, parseFigureText, sceneSha256 } from './research-figure-document'
import { diffFigureElements } from './research-figure-diff'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import type { FigureTarget } from './research-figures-export'
import {
  FIGURE_HISTORY_PER_FIGURE,
  entryFiles,
  fileStamp,
  historyRoot,
  pruneProject,
  readIndex,
  removeEntryFiles,
  serialized,
  writeIndex,
  type FigureCheckpointKind,
  type FigureHistoryEntry
} from './research-figure-history-index'
import {
  listProjectDirectory,
  moveProjectPath,
  projectOwnerKey,
  readProjectFile,
  readProjectText,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export const FIGURE_CHECKPOINT_LABELS: Record<FigureCheckpointKind, string> = {
  'before-send': 'Before send',
  'agent-result': 'Agent result',
  'my-edit': 'My edit',
  'before-restore': 'Before restore'
}

export {
  FIGURE_HISTORY_PER_FIGURE,
  FIGURE_HISTORY_PROJECT_BYTES,
  PLOT_VERSION_FILES,
  type FigureCheckpointKind,
  type FigureHistoryEntry
} from './research-figure-history-index'

/** Moves whenever a version is kept or dropped, so open History lists reload. */
export const useFigureHistoryRevision = create<{ revision: number }>(() => ({ revision: 0 }))

function bumpRevision(): void {
  useFigureHistoryRevision.setState((state) => ({ revision: state.revision + 1 }))
}

/**
 * Where a figure's versions live: `<record root>/cache/figures/history/<slug>/`, one
 * `<iso>-<kind>.excalidraw` (compact JSON, so every host's text API reads it back) and one 300 px
 * `<iso>-<kind>.png` per version, listed newest first in `index.json`.
 */
export async function figureHistoryFolder(owner: ProjectFileOwner, slug: string): Promise<string> {
  return `${await historyRoot(owner)}/${slug}`
}

/**
 * Takes a figure's versions along when it is renamed. History is a cache: when the new name already
 * has versions or the move fails, the old ones stay where they were and nothing else is lost.
 */
export async function moveFigureHistory(
  owner: ProjectFileOwner,
  fromSlug: string,
  toSlug: string
): Promise<void> {
  const root = await historyRoot(owner)
  const entries = await listProjectDirectory(owner, root).catch(() => null)
  if (
    !entries?.some((entry) => entry.isDirectory && entry.name === fromSlug) ||
    entries.some((entry) => entry.name === toSlug)
  ) {
    return
  }
  await moveProjectPath(owner, `${root}/${fromSlug}`, `${root}/${toSlug}`).catch(() => undefined)
  useFigureHistoryRevision.setState((state) => ({ revision: state.revision + 1 }))
}

export type FigureSnapshotInput = {
  kind: FigureCheckpointKind
  what: string
  /** The scene file's text to keep. */
  text: string
  /** The version this one is compared to for its deltas (e.g. the one before the agent's turn). */
  compareTo?: string | null
}

/** What a version's files took, as `keepFigureVersion`'s writer reports it. */
export type FigureVersionFiles = { bytes: number; thumbnail: boolean; plot?: string[] }

/**
 * Keeps a version of a figure or plot: `write` puts its files in the history folder under `id`.
 * Returns the newest entry instead when `sha` is the newest's, and null when the history could
 * not be written (a checkpoint never blocks a save or a request). The caps apply after each one.
 */
export function keepFigureVersion(
  owner: ProjectFileOwner,
  slug: string,
  input: {
    kind: FigureCheckpointKind
    what: string
    sha: string
    deltas?: FigureHistoryEntry['deltas']
    write: (folder: string, id: string) => Promise<FigureVersionFiles>
  }
): Promise<FigureHistoryEntry | null> {
  return serialized(owner, async () => {
    const folder = await figureHistoryFolder(owner, slug)
    const entries = await readIndex(owner, folder)
    if (entries[0]?.sha === input.sha) {
      return entries[0]
    }
    const at = new Date().toISOString()
    const id = `${fileStamp(at)}-${input.kind}`
    const written = await input.write(folder, id)
    const entry: FigureHistoryEntry = {
      id,
      at,
      kind: input.kind,
      what: input.what.replace(/\s+/g, ' ').trim().slice(0, 140),
      sha: input.sha,
      bytes: written.bytes,
      deltas: input.deltas ?? null,
      thumbnail: written.thumbnail,
      ...(written.plot ? { plot: written.plot } : {})
    }
    const next = [entry, ...entries]
    for (const old of next.splice(FIGURE_HISTORY_PER_FIGURE)) {
      await removeEntryFiles(owner, folder, old)
    }
    await writeIndex(owner, folder, next)
    await pruneProject(owner, id)
    bumpRevision()
    return entry
  }).catch(() => null)
}

/**
 * Keeps a version of a figure. Returns the newest entry instead when the text is the same as it,
 * and null when the history could not be written (a checkpoint never blocks a save or a request).
 */
export async function snapshotFigure(
  target: FigureTarget,
  input: FigureSnapshotInput
): Promise<FigureHistoryEntry | null> {
  const { owner, slug } = target
  const parsed = parseFigureText(input.text)
  const compared = input.compareTo ? parseFigureText(input.compareTo) : null
  let diff: ReturnType<typeof diffFigureElements> | null = null
  try {
    diff = compared ? diffFigureElements(compared.elements, parsed.elements) : null
  } catch {
    // Why: a version without its counts still restores.
  }
  return keepFigureVersion(owner, slug, {
    kind: input.kind,
    what: input.what,
    sha: await sceneSha256(input.text),
    deltas: diff
      ? { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length }
      : null,
    write: async (folder, id) => {
      const files = entryFiles(folder, id)
      const compact = parsed.issues.length ? input.text : JSON.stringify(JSON.parse(input.text))
      await writeProjectText(owner, files.scene, compact)
      let thumbnailBytes = 0
      try {
        const { figureThumbnailPng } = await import('./research-figure-history-render')
        const png = await figureThumbnailPng(input.text)
        if (png) {
          await writeProjectBinary(owner, files.thumbnail, png)
          thumbnailBytes = png.length
        }
      } catch {
        // Why: a version without a picture still restores.
      }
      return {
        bytes: new TextEncoder().encode(compact).length + thumbnailBytes,
        thumbnail: thumbnailBytes > 0
      }
    }
  })
}

/** A figure's kept versions, newest first. */
export async function listFigureHistory(
  owner: ProjectFileOwner,
  slug: string
): Promise<FigureHistoryEntry[]> {
  return readIndex(owner, await figureHistoryFolder(owner, slug))
}

/** A kept version's scene, pretty-printed like the figure file. */
export async function readFigureSnapshot(
  owner: ProjectFileOwner,
  slug: string,
  id: string
): Promise<string> {
  const text = await readProjectText(
    owner,
    entryFiles(await figureHistoryFolder(owner, slug), id).scene
  )
  try {
    return figureFileText(JSON.parse(text))
  } catch {
    return text
  }
}

/** A kept version's 300 px picture as a data URL, or null. */
export async function figureSnapshotThumbnail(
  owner: ProjectFileOwner,
  slug: string,
  id: string
): Promise<string | null> {
  const file = await readProjectFile(
    owner,
    entryFiles(await figureHistoryFolder(owner, slug), id).thumbnail
  ).catch(() => null)
  if (!file?.isBinary || !file.content) {
    return null
  }
  return `data:${file.mimeType ?? 'image/png'};base64,${file.content}`
}

/**
 * Puts a version back. On the open canvas it is one undo step and is saved; otherwise the file is
 * rewritten. Either way the version it replaces is kept first, so a restore loses nothing.
 */
export async function restoreFigureText(
  target: FigureTarget,
  text: string,
  what: string
): Promise<string | null> {
  const handle = useFigureEditorHandle.getState().handle
  const open =
    handle &&
    handle.target.slug === target.slug &&
    handle.target.folder === target.folder &&
    projectOwnerKey(handle.target.owner) === projectOwnerKey(target.owner)
  if (open) {
    const [{ figureSceneText }, { applyFigureText }] = await Promise.all([
      import('./research-figures-export'),
      import('./use-figure-file-sync')
    ])
    await snapshotFigure(target, {
      kind: 'before-restore',
      what,
      text: figureSceneText(handle.api)
    })
    applyFigureText(handle.api, text)
    return (await handle.save()) ? null : 'The restored version is on the canvas but not saved yet.'
  }
  const path = figureFilePaths(target.folder, target.slug).scene
  const current = await readProjectText(target.owner, path).catch(() => null)
  if (current !== null) {
    await snapshotFigure(target, { kind: 'before-restore', what, text: current })
  }
  await writeProjectText(target.owner, path, text, current)
  return null
}

/** Restores a kept version of the figure (see `restoreFigureText`). */
export async function restoreFigureSnapshot(
  target: FigureTarget,
  id: string
): Promise<string | null> {
  try {
    const text = await readFigureSnapshot(target.owner, target.slug, id)
    return await restoreFigureText(target, text, 'Before restoring an earlier version')
  } catch (cause) {
    return `The version was not restored. ${cause instanceof Error ? cause.message : String(cause)}`
  }
}
