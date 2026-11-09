import { create } from 'zustand'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { figureFileText, parseFigureText, sceneSha256 } from './research-figure-document'
import { diffFigureElements } from './research-figure-diff'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import type { FigureTarget } from './research-figures-export'
import {
  deleteProjectPath,
  isMissingProjectFile,
  listProjectDirectory,
  moveProjectPath,
  projectOwnerKey,
  projectRecordRoot,
  readProjectFile,
  readProjectText,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

/** Why a version was kept: before an agent request, after its turn, a human save, a restore. */
export type FigureCheckpointKind = 'before-send' | 'agent-result' | 'my-edit' | 'before-restore'

export const FIGURE_CHECKPOINT_LABELS: Record<FigureCheckpointKind, string> = {
  'before-send': 'Before send',
  'agent-result': 'Agent result',
  'my-edit': 'My edit',
  'before-restore': 'Before restore'
}

export type FigureHistoryEntry = {
  /** `<iso>-<kind>`, the stem of its files. */
  id: string
  at: string
  kind: FigureCheckpointKind
  /** The request, or what the person did. */
  what: string
  sha: string
  bytes: number
  /** Element changes since the version it was compared to; null when not compared. */
  deltas: { added: number; changed: number; removed: number } | null
  thumbnail: boolean
}

/** Moves whenever a version is kept or dropped, so open History lists reload. */
export const useFigureHistoryRevision = create<{ revision: number }>(() => ({ revision: 0 }))

function bumpRevision(): void {
  useFigureHistoryRevision.setState((state) => ({ revision: state.revision + 1 }))
}

export const FIGURE_HISTORY_PER_FIGURE = 30
export const FIGURE_HISTORY_PROJECT_BYTES = 20 * 1024 * 1024
const INDEX_FILE = 'index.json'

async function historyRoot(owner: ProjectFileOwner): Promise<string> {
  return `${await projectRecordRoot(owner)}/cache/figures/history`
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

function entryFiles(folder: string, id: string): { scene: string; thumbnail: string } {
  return { scene: `${folder}/${id}.excalidraw`, thumbnail: `${folder}/${id}.png` }
}

function isEntry(value: unknown): value is FigureHistoryEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  return ['id', 'at', 'sha', 'kind'].every((key) => typeof Reflect.get(value, key) === 'string')
}

async function readIndex(owner: ProjectFileOwner, folder: string): Promise<FigureHistoryEntry[]> {
  try {
    const value: unknown = JSON.parse(await readProjectText(owner, `${folder}/${INDEX_FILE}`))
    const entries: unknown = value && typeof value === 'object' ? Reflect.get(value, 'entries') : []
    return Array.isArray(entries) ? entries.filter(isEntry) : []
  } catch (error) {
    if (isMissingProjectFile(error) || error instanceof SyntaxError) {
      return []
    }
    throw error
  }
}

async function writeIndex(
  owner: ProjectFileOwner,
  folder: string,
  entries: readonly FigureHistoryEntry[]
): Promise<void> {
  await writeProjectText(
    owner,
    `${folder}/${INDEX_FILE}`,
    `${JSON.stringify({ version: 1, entries }, null, 1)}\n`
  )
}

async function removeEntryFiles(owner: ProjectFileOwner, folder: string, id: string) {
  const files = entryFiles(folder, id)
  await Promise.all(
    [files.scene, files.thumbnail].map((path) =>
      deleteProjectPath(owner, path).catch(() => undefined)
    )
  )
}

const queues = new Map<string, Promise<unknown>>()

/** One history write at a time per project, so two checkpoints never race on an index. */
function serialized<T>(owner: ProjectFileOwner, task: () => Promise<T>): Promise<T> {
  const key = projectOwnerKey(owner)
  const run = (queues.get(key) ?? Promise.resolve()).then(task, task)
  queues.set(
    key,
    run.catch(() => undefined)
  )
  return run
}

function fileStamp(at: string): string {
  return at.replace(/[:.]/g, '-')
}

/** Drops the oldest versions until every figure keeps 30 and the project 20 MB. */
async function pruneProject(owner: ProjectFileOwner, keep: string): Promise<void> {
  const root = await historyRoot(owner)
  const folders = ((await listProjectDirectory(owner, root)) ?? []).filter(
    (entry) => entry.isDirectory
  )
  const all: { folder: string; entry: FigureHistoryEntry }[] = []
  const indexes = new Map<string, FigureHistoryEntry[]>()
  for (const { name } of folders) {
    const folder = `${root}/${name}`
    const entries = await readIndex(owner, folder)
    indexes.set(folder, entries)
    all.push(...entries.map((entry) => ({ folder, entry })))
  }
  let total = all.reduce((sum, { entry }) => sum + entry.bytes, 0)
  if (total <= FIGURE_HISTORY_PROJECT_BYTES) {
    return
  }
  const changed = new Set<string>()
  for (const { folder, entry } of all.sort((a, b) => a.entry.at.localeCompare(b.entry.at))) {
    if (total <= FIGURE_HISTORY_PROJECT_BYTES) {
      break
    }
    if (entry.id === keep) {
      continue
    }
    await removeEntryFiles(owner, folder, entry.id)
    indexes.set(
      folder,
      (indexes.get(folder) ?? []).filter((kept) => kept.id !== entry.id)
    )
    changed.add(folder)
    total -= entry.bytes
  }
  for (const folder of changed) {
    await writeIndex(owner, folder, indexes.get(folder) ?? [])
  }
}

export type FigureSnapshotInput = {
  kind: FigureCheckpointKind
  what: string
  /** The scene file's text to keep. */
  text: string
  /** The version this one is compared to for its deltas (e.g. the one before the agent's turn). */
  compareTo?: string | null
}

/**
 * Keeps a version of a figure. Returns the newest entry instead when the text is the same as it,
 * and null when the history could not be written (a checkpoint never blocks a save or a request).
 */
export function snapshotFigure(
  target: FigureTarget,
  input: FigureSnapshotInput
): Promise<FigureHistoryEntry | null> {
  return serialized(target.owner, async () => {
    const { owner, slug } = target
    const folder = await figureHistoryFolder(owner, slug)
    const sha = await sceneSha256(input.text)
    const entries = await readIndex(owner, folder)
    if (entries[0]?.sha === sha) {
      return entries[0]
    }
    const at = new Date().toISOString()
    const id = `${fileStamp(at)}-${input.kind}`
    const files = entryFiles(folder, id)
    const parsed = parseFigureText(input.text)
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
    const compared = input.compareTo ? parseFigureText(input.compareTo) : null
    const diff = compared ? diffFigureElements(compared.elements, parsed.elements) : null
    const entry: FigureHistoryEntry = {
      id,
      at,
      kind: input.kind,
      what: input.what.replace(/\s+/g, ' ').trim().slice(0, 140),
      sha,
      bytes: new TextEncoder().encode(compact).length + thumbnailBytes,
      deltas: diff
        ? { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length }
        : null,
      thumbnail: thumbnailBytes > 0
    }
    const next = [entry, ...entries]
    for (const old of next.splice(FIGURE_HISTORY_PER_FIGURE)) {
      await removeEntryFiles(owner, folder, old.id)
    }
    await writeIndex(owner, folder, next)
    await pruneProject(owner, id)
    bumpRevision()
    return entry
  }).catch(() => null)
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
