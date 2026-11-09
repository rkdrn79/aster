import { buildWorkspaceFileContext } from '@/lib/workspace-file-host-routing'
import { readRuntimeFileContent } from '@/runtime/runtime-file-read-client'
import {
  createRuntimePath,
  deleteRuntimePath,
  readRuntimeDirectory,
  renameRuntimePath,
  writeRuntimeFile
} from '@/runtime/runtime-file-mutation-client'
import { callRuntimeFileMutation } from '@/runtime/runtime-file-mutation-rpc'
import { statRuntimeReadTarget } from '@/runtime/runtime-file-range-client'
import {
  getRelativePathInsideWorktree,
  getRemoteFileArgs,
  withSshMutationExpectation
} from '@/runtime/runtime-file-routing'
import type {
  RuntimeFileReadArgs,
  RuntimeReadableFileContent
} from '@/runtime/runtime-file-client-types'
import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import type { DirEntry } from '../../../../shared/filesystem-entry-types'

/** A project folder on whichever host holds it: this Mac, or an Aster server over SSH or relay. */
export type ProjectFileOwner = { hostId: string; workspaceId: string; workspacePath: string }

// Why: 384 KiB of bytes is 512 KiB of base64, the slice size remote uploads already use.
const BINARY_SLICE_BYTES = 384 * 1024

export class ProjectWriteConflict extends Error {
  constructor(relativePath: string) {
    super(`${relativePath} changed on disk while saving.`)
    this.name = 'ProjectWriteConflict'
  }
}

export function projectOwnerKey(owner: Pick<ProjectFileOwner, 'hostId' | 'workspaceId'>): string {
  return JSON.stringify([owner.hostId, owner.workspaceId])
}

export function projectAbsolutePath(owner: ProjectFileOwner, relativePath: string): string {
  return resolveRuntimePath(owner.workspacePath, relativePath)
}

function fileContext(owner: ProjectFileOwner) {
  return buildWorkspaceFileContext(owner.workspaceId, owner.workspacePath)
}

function readArgs(owner: ProjectFileOwner, relativePath: string): RuntimeFileReadArgs {
  const context = fileContext(owner)
  const filePath = projectAbsolutePath(owner, relativePath)
  return {
    target: context.target,
    filePath,
    relativePath: getRelativePathInsideWorktree(owner.workspacePath, filePath) ?? undefined,
    worktreeId: owner.workspaceId,
    connectionId: context.connectionId,
    pageOversizedBinary: true
  }
}

export function isMissingProjectFile(error: unknown): boolean {
  return /ENOENT|not[ _]found|no such file|does not exist/i.test(String(error))
}

/** A folder's entries, or null when it does not exist. */
export async function listProjectDirectory(
  owner: ProjectFileOwner,
  relativePath: string
): Promise<DirEntry[] | null> {
  try {
    return await readRuntimeDirectory(fileContext(owner), projectAbsolutePath(owner, relativePath))
  } catch (error) {
    if (isMissingProjectFile(error)) {
      return null
    }
    throw error
  }
}

export async function readProjectText(owner: ProjectFileOwner, relativePath: string) {
  const result = await readRuntimeFileContent(readArgs(owner, relativePath))
  if (result.isBinary) {
    throw new Error(`${relativePath} is not a text file.`)
  }
  return result.content
}

/** Text as-is, binary files as base64 with their MIME type. */
export function readProjectFile(
  owner: ProjectFileOwner,
  relativePath: string
): Promise<RuntimeReadableFileContent> {
  return readRuntimeFileContent(readArgs(owner, relativePath))
}

/** Changes whenever the file is rewritten, by the app or an agent. */
export async function projectFileSignature(
  owner: ProjectFileOwner,
  relativePath: string
): Promise<{ signature: string; mtime: number }> {
  const stat = await statRuntimeReadTarget(readArgs(owner, relativePath))
  return { signature: `${stat.size}:${stat.mtime}`, mtime: stat.mtime }
}

export async function ensureProjectDirectory(
  owner: ProjectFileOwner,
  relativePath: string
): Promise<void> {
  if (await listProjectDirectory(owner, relativePath)) {
    return
  }
  // Why parents first: a remote host's createDir may not make missing parents.
  const parent = relativePath.slice(0, Math.max(0, relativePath.lastIndexOf('/')))
  if (parent) {
    await ensureProjectDirectory(owner, parent)
  }
  try {
    await createRuntimePath(
      fileContext(owner),
      projectAbsolutePath(owner, relativePath),
      'directory'
    )
  } catch (error) {
    // Why: an agent may have created it between the check and here.
    if (!/exist/i.test(String(error))) {
      throw error
    }
  }
}

function parentFolder(relativePath: string): string {
  return relativePath.slice(0, Math.max(0, relativePath.lastIndexOf('/')))
}

/**
 * Writes text. With `previous` (null: the file must still be absent) the write is refused when the
 * file no longer holds it, so an edit never overwrites what an agent wrote in the meantime.
 */
export async function writeProjectText(
  owner: ProjectFileOwner,
  relativePath: string,
  content: string,
  previous?: string | null
): Promise<void> {
  const folder = parentFolder(relativePath)
  if (folder) {
    await ensureProjectDirectory(owner, folder)
  }
  const result = await writeRuntimeFile(
    fileContext(owner),
    projectAbsolutePath(owner, relativePath),
    content,
    undefined,
    previous === undefined
      ? undefined
      : {
          expectedSignature: getDiskBaselineSignature(previous ?? ''),
          ...(previous === null ? { allowMissing: true } : {})
        }
  )
  if (!result.ok) {
    throw new ProjectWriteConflict(relativePath)
  }
}

/** Moves or renames a file inside the project, making the target's folder first. */
export async function moveProjectPath(
  owner: ProjectFileOwner,
  fromPath: string,
  toPath: string
): Promise<void> {
  const folder = parentFolder(toPath)
  if (folder) {
    await ensureProjectDirectory(owner, folder)
  }
  await renameRuntimePath(
    fileContext(owner),
    projectAbsolutePath(owner, fromPath),
    projectAbsolutePath(owner, toPath)
  )
}

/** Deletes a file (or a folder with `recursive`) on whichever host holds the project. */
export async function deleteProjectPath(
  owner: ProjectFileOwner,
  relativePath: string,
  recursive?: boolean
): Promise<void> {
  await deleteRuntimePath(fileContext(owner), projectAbsolutePath(owner, relativePath), recursive)
}

const recordRoots = new Map<string, Promise<'.aster' | 'research'>>()

/**
 * The record tree the harness writes to: `.aster/`, or `research/` in a project set up before
 * ADR-004 that has no `.aster/project.json`.
 */
export function projectRecordRoot(owner: ProjectFileOwner): Promise<'.aster' | 'research'> {
  const key = projectOwnerKey(owner)
  const known = recordRoots.get(key)
  if (known) {
    return known
  }
  const hasCatalog = async (root: string): Promise<boolean> =>
    Boolean(
      (await listProjectDirectory(owner, root))?.some(
        (entry) => entry.name === 'project.json' && !entry.isDirectory
      )
    )
  const root = (async () =>
    (await hasCatalog('.aster')) || !(await hasCatalog('research')) ? '.aster' : 'research')()
  recordRoots.set(key, root)
  root.catch(() => recordRoots.delete(key))
  return root
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return window.btoa(binary)
}

/**
 * Writes bytes: through the Aster server's `files.writeBase64` on a remote host (in slices for
 * large files), through the desktop app on this Mac.
 */
export async function writeProjectBinary(
  owner: ProjectFileOwner,
  relativePath: string,
  bytes: Uint8Array
): Promise<void> {
  const folder = parentFolder(relativePath)
  if (folder) {
    await ensureProjectDirectory(owner, folder)
  }
  const context = fileContext(owner)
  const absolutePath = projectAbsolutePath(owner, relativePath)
  const remote = getRemoteFileArgs(context, absolutePath)
  if (remote) {
    const address = { worktree: remote.worktreeSelector, relativePath: remote.relativePath }
    if (bytes.length <= BINARY_SLICE_BYTES) {
      await callRuntimeFileMutation(
        remote.target,
        'files.writeBase64',
        withSshMutationExpectation(context, { ...address, contentBase64: bytesToBase64(bytes) }),
        30_000
      )
      return
    }
    for (let offset = 0; offset < bytes.length; offset += BINARY_SLICE_BYTES) {
      const slice = bytes.subarray(offset, offset + BINARY_SLICE_BYTES)
      await callRuntimeFileMutation(
        remote.target,
        'files.writeBase64Chunk',
        withSshMutationExpectation(context, {
          ...address,
          contentBase64: bytesToBase64(slice),
          append: offset > 0
        }),
        30_000
      )
    }
    return
  }
  const write = window.api.researchFigures?.writeFile
  if (context.connectionId || !write) {
    throw new Error(
      'This host cannot take PDF or image exports. Connect it through an Aster server.'
    )
  }
  await write({ filePath: absolutePath, contentBase64: bytesToBase64(bytes) })
}
