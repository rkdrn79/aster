import { lstat, opendir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { z } from 'zod'
import { layoutRelativePaths } from '../../research-harness/research-layout.mjs'
import type {
  ResearchProjectArtifactEntry,
  ResearchProjectFile
} from '../../shared/research/research-project-api'
import {
  readNodeFileHandleWithinLimit,
  readNodeFileWithinLimit
} from '../../shared/node-bounded-file-reader'
import { isDescendantOrEqual, isENOENT } from '../ipc/filesystem-path-containment'
import { openLocalRegularFile } from '../ipc/filesystem/local-regular-file-read'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveRuntimeAuthorizedPath } from '../runtime/files/chat-scratch-file-root'
import { requireLocalRuntimeFileRoute } from '../runtime/files/file-target'
import {
  joinWorktreeRelativePath,
  normalizeRuntimeRelativePath
} from '../runtime/runtime-relative-paths'

/** A workspace on this host whose research records a read may open. */
export type ResearchProjectRoot = {
  /** Canonical (symlink-free) workspace path. */
  path: string
  /** The canonical form of an absolute path; throws outside the runtime's allowed roots. */
  authorize: (absolutePath: string) => Promise<string>
}

/** Resolves the selector the way `files.read` does; SSH and runtime-hosted workspaces throw. */
export async function resolveResearchProjectRoot(
  runtime: Pick<OrcaRuntimeService, 'resolveRuntimeFileTarget' | 'requireStore'>,
  worktreeSelector: string
): Promise<ResearchProjectRoot> {
  const target = await runtime.resolveRuntimeFileTarget(worktreeSelector)
  requireLocalRuntimeFileRoute(target)
  const store = runtime.requireStore()
  const authorize = (path: string): Promise<string> => resolveRuntimeAuthorizedPath(path, store)
  return { path: await authorize(target.worktree.path), authorize }
}

/**
 * The canonical path of a project-relative `/` path. Refuses `..`, absolute paths, and symlinks
 * that lead out of this workspace, even into another allowed root.
 */
export async function resolveResearchWorkspacePath(
  root: ResearchProjectRoot,
  relativePath: string
): Promise<string> {
  const normalized = normalizeRuntimeRelativePath(relativePath, root.path)
  const resolved = await root.authorize(joinWorktreeRelativePath(root.path, normalized))
  if (!isDescendantOrEqual(resolved, root.path)) {
    throw new Error(`${relativePath} leads outside the workspace.`)
  }
  return resolved
}

/** `absolute`, a path the harness layout gave for this workspace, as a project-relative `/` path. */
export function researchProjectRelativePath(root: ResearchProjectRoot, absolute: string): string {
  return relative(root.path, absolute).split(sep).join('/')
}

/** Like `resolveResearchWorkspacePath`, limited to the harness's records folder. */
export async function resolveResearchProjectPath(
  root: ResearchProjectRoot,
  relativePath: string
): Promise<string> {
  const records = layoutRelativePaths(root.path).root
  if (!normalizeRuntimeRelativePath(relativePath, root.path).startsWith(`${records}/`)) {
    throw new Error(`Not a path under ${records}/: ${relativePath}`)
  }
  return resolveResearchWorkspacePath(root, relativePath)
}

export function unreadableResearchProjectFile(error: unknown): {
  status: 'unreadable'
  reason: string
} {
  return { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
}

/** Parsed JSON of a whole file of at most `maxBytes`; `onRead` is charged the bytes read. */
export async function readResearchProjectJson(
  root: ResearchProjectRoot,
  relativePath: string,
  maxBytes: number,
  onRead?: (bytes: number) => void
): Promise<ResearchProjectFile<unknown>> {
  try {
    const path = await resolveResearchProjectPath(root, relativePath)
    let buffer: Buffer
    try {
      buffer = (await readNodeFileWithinLimit(path, maxBytes, { regularFileOnly: true })).buffer
    } catch (error) {
      if (isENOENT(error)) {
        return { status: 'absent' }
      }
      throw error
    }
    onRead?.(buffer.length)
    return { status: 'present', value: JSON.parse(buffer.toString('utf8')) }
  } catch (error) {
    return unreadableResearchProjectFile(error)
  }
}

export function parseResearchProjectFile<T>(
  file: ResearchProjectFile<unknown>,
  schema: z.ZodType<T>,
  label: string
): ResearchProjectFile<T> {
  if (file.status !== 'present') {
    return file
  }
  const parsed = schema.safeParse(file.value)
  return parsed.success
    ? { status: 'present', value: parsed.data }
    : { status: 'unreadable', reason: `${label} does not match its schema version 1 shape.` }
}

/** Non-empty lines from the start of a JSONL file, cut at a row boundary once `maxBytes` is read. */
export async function readResearchProjectJsonlHead(
  root: ResearchProjectRoot,
  relativePath: string,
  maxBytes: number
): Promise<ResearchProjectFile<{ size: number; lines: string[]; truncated: boolean }>> {
  try {
    const read = await readResearchProjectBytes(
      await resolveResearchProjectPath(root, relativePath),
      maxBytes,
      'start'
    )
    if (!read) {
      return { status: 'absent' }
    }
    const truncated = read.size > read.bytes.length
    const text = read.bytes.toString('utf8')
    // Why: a cut read ends mid-row; that fragment is not a row.
    const body = truncated ? text.slice(0, text.lastIndexOf('\n') + 1) : text
    const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0)
    return { status: 'present', value: { size: read.size, lines, truncated } }
  } catch (error) {
    return unreadableResearchProjectFile(error)
  }
}

export type ResearchProjectBytes = { bytes: Buffer; size: number; offset: number }

/**
 * Up to `maxBytes` of a regular file, from its start or (`end`) its newest bytes; null when the
 * file does not exist.
 */
export async function readResearchProjectBytes(
  path: string,
  maxBytes: number,
  from: 'start' | 'end'
): Promise<ResearchProjectBytes | null> {
  let opened: Awaited<ReturnType<typeof openLocalRegularFile>>
  try {
    opened = await openLocalRegularFile(path)
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
  const { handle, stats } = opened
  try {
    const length = Math.min(stats.size, maxBytes)
    const offset = from === 'end' ? stats.size - length : 0
    const { buffer } = await readNodeFileHandleWithinLimit(handle, maxBytes, {
      window: { offset, length }
    })
    return { bytes: buffer, size: stats.size, offset }
  } finally {
    await handle.close()
  }
}

/** The first `maxEntries` entries of a folder, without following symlinks; null when absent. */
export async function listResearchProjectFolder(
  path: string,
  maxEntries: number
): Promise<{ entries: ResearchProjectArtifactEntry[]; truncated: boolean } | null> {
  let folder: Awaited<ReturnType<typeof opendir>>
  try {
    folder = await opendir(path)
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
  const entries: ResearchProjectArtifactEntry[] = []
  let truncated = false
  // Why for-await: leaving the loop early closes the handle, and a huge folder is never read whole.
  for await (const entry of folder) {
    if (entries.length >= maxEntries) {
      truncated = true
      break
    }
    const kind = entry.isSymbolicLink()
      ? 'symlink'
      : entry.isDirectory()
        ? 'directory'
        : entry.isFile()
          ? 'file'
          : 'other'
    const bytes =
      kind === 'file'
        ? await lstat(join(path, entry.name)).then(
            (info) => info.size,
            () => null
          )
        : null
    entries.push({ name: entry.name, kind, bytes })
  }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  return { entries, truncated }
}
