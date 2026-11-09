import { buildWorkspaceFileContext } from '@/lib/workspace-file-host-routing'
import { readRuntimeFileContent } from '@/runtime/runtime-file-read-client'
import {
  createRuntimePath,
  readRuntimeDirectory,
  writeRuntimeFile
} from '@/runtime/runtime-file-mutation-client'
import { statRuntimeReadTarget } from '@/runtime/runtime-file-range-client'
import { getRelativePathInsideWorktree } from '@/runtime/runtime-file-routing'
import type { RuntimeFileReadArgs } from '@/runtime/runtime-file-client-types'
import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import type { DirEntry } from '../../../../shared/filesystem-entry-types'

/** The workspace a rebuttal lives in, on whichever host holds the project. */
export type RebuttalOwner = { hostId: string; workspaceId: string; workspacePath: string }

export const REBUTTAL_JSON_FILES = {
  meta: 'rebuttal.json',
  points: 'points.json',
  clusters: 'clusters.json',
  promises: 'promises.json',
  followUps: 'followups.json',
  proposals: 'proposals.json',
  predictions: 'predictions.json',
  paperChanges: 'paper-changes.json'
} as const
export type RebuttalJsonFile = keyof typeof REBUTTAL_JSON_FILES
export type RebuttalJsonFileName = (typeof REBUTTAL_JSON_FILES)[RebuttalJsonFile]

export class RebuttalWriteConflict extends Error {
  constructor(relativePath: string) {
    super(`${relativePath} changed while saving. It was reloaded; apply the edit again.`)
    this.name = 'RebuttalWriteConflict'
  }
}

export function rebuttalOwnerKey(owner: Pick<RebuttalOwner, 'hostId' | 'workspaceId'>): string {
  return JSON.stringify([owner.hostId, owner.workspaceId])
}

export function rebuttalAbsolutePath(owner: RebuttalOwner, relativePath: string): string {
  return resolveRuntimePath(owner.workspacePath, relativePath)
}

function fileContext(owner: RebuttalOwner) {
  return buildWorkspaceFileContext(owner.workspaceId, owner.workspacePath)
}

function readArgs(owner: RebuttalOwner, relativePath: string): RuntimeFileReadArgs {
  const context = fileContext(owner)
  const filePath = rebuttalAbsolutePath(owner, relativePath)
  return {
    target: context.target,
    filePath,
    relativePath: getRelativePathInsideWorktree(owner.workspacePath, filePath) ?? undefined,
    worktreeId: owner.workspaceId,
    connectionId: context.connectionId
  }
}

function isMissing(error: unknown): boolean {
  return /ENOENT|not[ _]found|no such file|does not exist/i.test(String(error))
}

/** A folder's entries, or null when it does not exist. */
export async function listRebuttalDirectory(
  owner: RebuttalOwner,
  relativePath: string
): Promise<DirEntry[] | null> {
  try {
    return await readRuntimeDirectory(fileContext(owner), rebuttalAbsolutePath(owner, relativePath))
  } catch (error) {
    if (isMissing(error)) {
      return null
    }
    throw error
  }
}

export async function readRebuttalText(
  owner: RebuttalOwner,
  relativePath: string
): Promise<string> {
  const result = await readRuntimeFileContent(readArgs(owner, relativePath))
  if (result.isBinary) {
    throw new Error(`${relativePath} is not a text file.`)
  }
  return result.content
}

export async function statRebuttalFile(
  owner: RebuttalOwner,
  relativePath: string
): Promise<string> {
  const stat = await statRuntimeReadTarget(readArgs(owner, relativePath))
  return `${stat.size}:${stat.mtime}`
}

/**
 * The record tree the harness writes to: `.aster/`, or `research/` in a project set up before
 * ADR-004 that has no `.aster/project.json`.
 */
export async function rebuttalRecordRoot(owner: RebuttalOwner): Promise<'.aster' | 'research'> {
  const aster = await listRebuttalDirectory(owner, '.aster')
  if (aster?.some((entry) => entry.name === 'project.json' && !entry.isDirectory)) {
    return '.aster'
  }
  const legacy = await listRebuttalDirectory(owner, 'research')
  return legacy?.some((entry) => entry.name === 'project.json' && !entry.isDirectory)
    ? 'research'
    : '.aster'
}

async function ensureDirectory(owner: RebuttalOwner, relativePath: string): Promise<void> {
  if (await listRebuttalDirectory(owner, relativePath)) {
    return
  }
  // Why parents first: a remote host's createDir may not make missing parents.
  const parent = relativePath.slice(0, Math.max(0, relativePath.lastIndexOf('/')))
  if (parent) {
    await ensureDirectory(owner, parent)
  }
  try {
    await createRuntimePath(
      fileContext(owner),
      rebuttalAbsolutePath(owner, relativePath),
      'directory'
    )
  } catch (error) {
    // Why: the agent may have created it between the check and here.
    if (!/exist/i.test(String(error))) {
      throw error
    }
  }
}

/**
 * Writes `content` only if the file still holds `previous` (null: still absent), so an edit
 * never overwrites what the agent wrote in the meantime.
 */
export async function writeRebuttalText(
  owner: RebuttalOwner,
  relativePath: string,
  content: string,
  previous: string | null
): Promise<void> {
  const folder = relativePath.slice(0, relativePath.lastIndexOf('/'))
  if (folder) {
    await ensureDirectory(owner, folder)
  }
  const result = await writeRuntimeFile(
    fileContext(owner),
    rebuttalAbsolutePath(owner, relativePath),
    content,
    undefined,
    {
      expectedSignature: getDiskBaselineSignature(previous ?? ''),
      ...(previous === null ? { allowMissing: true } : {})
    }
  )
  if (!result.ok) {
    throw new RebuttalWriteConflict(relativePath)
  }
}

export async function ensureRebuttalFolders(
  owner: RebuttalOwner,
  directory: string
): Promise<void> {
  await ensureDirectory(owner, `${directory}/reviews`)
  await ensureDirectory(owner, `${directory}/responses`)
}
