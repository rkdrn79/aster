import type { DirEntry } from '../../../../shared/filesystem-entry-types'
import { sortDirEntries } from '../../../../shared/file-name-sort'
import {
  authorityKey,
  hostAuthorityFromOperationRoute,
  parseHostAuthorityKey
} from '../../../../shared/host-authority'
import { relativePathInsideRoot, resolveRuntimePath } from '../../../../shared/cross-platform-path'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { readRuntimeDirectory } from '../../runtime/runtime-file-mutation-client'
import {
  getFileExplorerOperationOwner,
  getFileExplorerOperationRoute
} from '../../components/right-sidebar/file-explorer-operation-owner'
import type { FileExplorerOperationOwner } from '../../components/right-sidebar/file-explorer-types'

export type WritingFileEntry = {
  name: string
  relativePath: string
  isDirectory: boolean
}

export function writingFileRoot(sourcePath: string): string {
  return sourcePath.replaceAll('\\', '/').split('/').slice(0, -1).join('/')
}

export class WritingFileOwnerUnavailableError extends Error {
  constructor() {
    super('The workspace host is unavailable or has changed. Reconnect before opening files.')
    this.name = 'WritingFileOwnerUnavailableError'
  }
}

function ownerAuthorityKey(owner: FileExplorerOperationOwner): string | null {
  const operationRoute =
    owner.kind === 'local'
      ? { executionHostId: 'local', runtimeEnvironmentId: null }
      : owner.kind === 'ssh'
        ? {
            executionHostId: `ssh:${encodeURIComponent(owner.connectionId)}`,
            runtimeEnvironmentId: null
          }
        : owner.kind === 'runtime'
          ? {
              executionHostId: owner.executionHostId,
              runtimeEnvironmentId: owner.environmentId
            }
          : null
  if (!operationRoute) {
    return null
  }
  const authority = hostAuthorityFromOperationRoute(operationRoute)
  return authority && authority !== 'contradictory' ? authorityKey(authority) : null
}

export function writingFileEntries(
  entries: DirEntry[],
  workspacePath: string,
  directoryPath: string,
  includeDirectories = true
): WritingFileEntry[] {
  return sortDirEntries(entries)
    .filter(
      (entry) =>
        entry.name !== '.' &&
        entry.name !== '..' &&
        entry.name !== '.git' &&
        entry.name !== '.aster' &&
        entry.name !== 'node_modules' &&
        !entry.name.includes('/') &&
        !entry.name.includes('\\') &&
        !entry.name.includes('\0') &&
        !entry.isSymlink &&
        ((includeDirectories && entry.isDirectory) || entry.name.toLowerCase().endsWith('.tex'))
    )
    .flatMap((entry) => {
      const absolutePath = resolveRuntimePath(directoryPath, entry.name)
      const relativePath = relativePathInsideRoot(workspacePath, absolutePath)
      return relativePath
        ? [{ name: entry.name, relativePath, isDirectory: entry.isDirectory }]
        : []
    })
}

export function writingFileAncestors(filePath: string | null, root = ''): string[] {
  if (!filePath || (root && !filePath.startsWith(`${root}/`))) {
    return []
  }
  const segments = filePath.split(/[\\/]/).filter(Boolean)
  const rootDepth = root ? root.split('/').length : 0
  return segments
    .slice(rootDepth, -1)
    .map((_, index) => segments.slice(0, rootDepth + index + 1).join('/'))
}

/** Nesting below the manuscript folder the tree starts at, not below the workspace root. */
export function writingFileDepth(relativePath: string, root = ''): number {
  const rootDepth = root ? root.split('/').length : 0
  return Math.max(0, relativePath.split('/').length - 1 - rootDepth)
}

export function visibleWritingFiles(
  childrenByDirectory: Readonly<Record<string, WritingFileEntry[]>>,
  expanded: ReadonlySet<string>,
  root = ''
): WritingFileEntry[] {
  const visible: WritingFileEntry[] = []
  function visit(directory: string): void {
    for (const entry of childrenByDirectory[directory] ?? []) {
      visible.push(entry)
      if (entry.isDirectory && expanded.has(entry.relativePath)) {
        visit(entry.relativePath)
      }
    }
  }
  visit(root)
  return visible
}

export async function readWritingFileDirectory(
  experiment: Pick<ExperimentRecord, 'hostId' | 'workspaceId' | 'workspacePath'>,
  writingRoot: string,
  relativeDirectory: string
): Promise<WritingFileEntry[]> {
  const expectedAuthority = parseHostAuthorityKey(experiment.hostId)
  const owner = getFileExplorerOperationOwner(experiment.workspaceId)
  const route = getFileExplorerOperationRoute(owner)
  if (
    !expectedAuthority ||
    !route ||
    ownerAuthorityKey(owner) !== authorityKey(expectedAuthority)
  ) {
    throw new WritingFileOwnerUnavailableError()
  }
  const directoryPath = resolveRuntimePath(experiment.workspacePath, relativeDirectory)
  const rootPath = resolveRuntimePath(experiment.workspacePath, writingRoot)
  if (
    relativePathInsideRoot(experiment.workspacePath, rootPath) !== writingRoot ||
    relativePathInsideRoot(rootPath, directoryPath) === null
  ) {
    throw new Error('Choose a folder inside the manuscript directory.')
  }
  const entries = await readRuntimeDirectory(
    {
      target: route.target,
      worktreeId: experiment.workspaceId,
      worktreePath: experiment.workspacePath,
      connectionId: route.connectionId,
      expectedExecutionHostId: route.expectedExecutionHostId,
      expectedSshTargetId: route.expectedSshTargetId,
      expectedSshConnectionGeneration: route.expectedSshConnectionGeneration
    },
    directoryPath
  )
  return writingFileEntries(entries, experiment.workspacePath, directoryPath, Boolean(writingRoot))
}
