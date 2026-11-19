// History's files: each figure's (or plot's) versions in \`<record root>/cache/figures/history\`,
// their index, and the per-figure and per-project caps.
import {
  deleteProjectPath,
  isMissingProjectFile,
  listProjectDirectory,
  projectOwnerKey,
  projectRecordRoot,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

/** Why a version was kept: before an agent request, after its turn, a human save, a restore. */
export type FigureCheckpointKind = 'before-send' | 'agent-result' | 'my-edit' | 'before-restore'

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
  /** A plot's version: the suffixes of the files it kept (see `PLOT_VERSION_FILES`). */
  plot?: string[]
}

/** The files a plot's version keeps, by the suffix each takes after the version's id. */
export const PLOT_VERSION_FILES = {
  script: '.plot.py',
  manifest: '.plot.json',
  pdf: '.pdf',
  svg: '.svg',
  embed: '.embed.svg',
  // Why `.png`: the plot's own preview is the version's thumbnail too.
  png: '.png'
} as const
const PLOT_SUFFIXES: ReadonlySet<string> = new Set(Object.values(PLOT_VERSION_FILES))

export const FIGURE_HISTORY_PER_FIGURE = 30
export const FIGURE_HISTORY_PROJECT_BYTES = 20 * 1024 * 1024
const INDEX_FILE = 'index.json'

export async function historyRoot(owner: ProjectFileOwner): Promise<string> {
  return `${await projectRecordRoot(owner)}/cache/figures/history`
}

export function entryFiles(folder: string, id: string): { scene: string; thumbnail: string } {
  return { scene: `${folder}/${id}.excalidraw`, thumbnail: `${folder}/${id}.png` }
}

function isEntry(value: unknown): value is FigureHistoryEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  return ['id', 'at', 'sha', 'kind'].every((key) => typeof Reflect.get(value, key) === 'string')
}

export async function readIndex(
  owner: ProjectFileOwner,
  folder: string
): Promise<FigureHistoryEntry[]> {
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

export async function writeIndex(
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

export async function removeEntryFiles(
  owner: ProjectFileOwner,
  folder: string,
  entry: Pick<FigureHistoryEntry, 'id' | 'plot'>
) {
  const files = entryFiles(folder, entry.id)
  // Why only known suffixes: the index is a file on disk, and its names must not reach elsewhere.
  const plot = (Array.isArray(entry.plot) ? entry.plot : [])
    .filter((suffix) => PLOT_SUFFIXES.has(suffix))
    .map((suffix) => `${folder}/${entry.id}${suffix}`)
  await Promise.all(
    [...new Set([files.scene, files.thumbnail, ...plot])].map((path) =>
      deleteProjectPath(owner, path).catch(() => undefined)
    )
  )
}

const queues = new Map<string, Promise<unknown>>()

/** One history write at a time per project, so two checkpoints never race on an index. */
export function serialized<T>(owner: ProjectFileOwner, task: () => Promise<T>): Promise<T> {
  const key = projectOwnerKey(owner)
  const run = (queues.get(key) ?? Promise.resolve()).then(task, task)
  queues.set(
    key,
    run.catch(() => undefined)
  )
  return run
}

export function fileStamp(at: string): string {
  return at.replace(/[:.]/g, '-')
}

/** Drops the oldest versions until every figure keeps 30 and the project 20 MB. */
export async function pruneProject(owner: ProjectFileOwner, keep: string): Promise<void> {
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
    await removeEntryFiles(owner, folder, entry)
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
