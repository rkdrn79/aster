import { getRelativePathInsideWorktree } from '@/runtime/runtime-file-routing'
import { readRuntimeFileRange, statRuntimeReadTarget } from '@/runtime/runtime-file-range-client'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/runtime-client-target'
import { authorityKey, parseHostAuthorityKey } from '../../../../shared/host-authority'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { MAX_FILE_RANGE_READ_BYTES } from '../../../../shared/file-range-read'
import { forEachWithConcurrency } from '../../../../shared/map-with-concurrency'
import { relativePathInsideRoot, resolveRuntimePath } from '../../../../shared/cross-platform-path'
import type { ExperimentRecord } from '../../../../shared/research/research-records'

const MAX_TEX_BYTES = 2 * 1024 * 1024
const MAX_PDF_BYTES = 24 * 1024 * 1024
// Why: the remote control queue has room for two capped range replies, but not three.
const READ_CONCURRENCY = 2

export type ManuscriptFile = {
  absolutePath: string
  relativePath: string
}

export type ManuscriptSource = {
  text: string
  size: number
  mtime: number
}

export type ManuscriptPdf = {
  base64: string
  size: number
  mtime: number
}

/** An Experiment or a Library scope: anything that names a workspace on a host. */
export type ResearchWorkspaceFileOwner = Pick<
  ExperimentRecord,
  'hostId' | 'workspaceId' | 'workspacePath'
>

export function resolveManuscriptFile(
  experiment: Pick<ExperimentRecord, 'workspacePath'>,
  path: string,
  extension: '.tex' | '.pdf'
): ManuscriptFile {
  const absolutePath = resolveRuntimePath(experiment.workspacePath, path.trim())
  const relativePath = relativePathInsideRoot(experiment.workspacePath, absolutePath)
  if (!relativePath || !relativePath.toLowerCase().endsWith(extension)) {
    throw new Error(`Choose a ${extension} file inside the project workspace.`)
  }
  return { absolutePath, relativePath }
}

export function isWritingTeXFile(
  experiment: ExperimentRecord,
  workspaceId: string | undefined,
  filePath: string,
  relativePath: string
): boolean {
  if (!experiment.manuscript || experiment.workspaceId !== workspaceId) {
    return false
  }
  try {
    return resolveManuscriptFile(experiment, relativePath, '.tex').absolutePath === filePath
  } catch {
    return false
  }
}

function manuscriptReadTarget(experiment: ResearchWorkspaceFileOwner, file: ManuscriptFile) {
  const authority = parseHostAuthorityKey(experiment.hostId)
  if (!authority || (authority.endpoint.kind === 'environment' && authority.at !== 'local')) {
    throw new Error('This host does not support manuscript file reads.')
  }
  const target = runtimeRpcTargetForAuthorityKey(authorityKey(authority))
  if (!target) {
    throw new Error('The workspace host is unavailable.')
  }
  const relativePath = getRelativePathInsideWorktree(experiment.workspacePath, file.absolutePath)
  if (relativePath === null) {
    throw new Error('Choose a file inside the project workspace.')
  }
  const ssh = authority.endpoint.kind === 'self' ? parseExecutionHostId(authority.at) : null
  return {
    target,
    filePath: file.absolutePath,
    relativePath,
    worktreeId: experiment.workspaceId,
    ...(ssh?.kind === 'ssh'
      ? { connectionId: ssh.targetId, expectedExternalSshTargetId: ssh.targetId }
      : {}),
    access: { kind: 'research-workspace' as const, workspacePath: experiment.workspacePath }
  }
}

async function readManuscriptBytes(
  experiment: ResearchWorkspaceFileOwner,
  file: ManuscriptFile,
  maxBytes: number
): Promise<{ bytes: Uint8Array<ArrayBuffer>; size: number; mtime: number }> {
  const args = manuscriptReadTarget(experiment, file)
  const before = await statRuntimeReadTarget(args)
  if (before.isDirectory) {
    throw new Error('Choose a file, not a directory.')
  }
  if (before.size > maxBytes) {
    throw new Error(
      `Preview exceeds the ${maxBytes / 1024 / 1024} MiB limit. Open the file in the editor.`
    )
  }
  const bytes = new Uint8Array(before.size)
  const offsets = Array.from(
    { length: Math.ceil(before.size / MAX_FILE_RANGE_READ_BYTES) },
    (_, index) => index * MAX_FILE_RANGE_READ_BYTES
  )
  await forEachWithConcurrency(offsets, READ_CONCURRENCY, async (offset) => {
    const length = Math.min(MAX_FILE_RANGE_READ_BYTES, before.size - offset)
    const chunk = await readRuntimeFileRange(args, offset, length)
    if (chunk.length !== length) {
      throw new Error('File changed during reading. Refresh to retry.')
    }
    bytes.set(chunk, offset)
  })
  const after = await statRuntimeReadTarget(args)
  if (after.size !== before.size || after.mtime !== before.mtime) {
    throw new Error('File changed during reading. Refresh to retry.')
  }
  return { bytes, size: after.size, mtime: after.mtime }
}

export async function readManuscriptSource(
  experiment: ResearchWorkspaceFileOwner,
  file: ManuscriptFile
): Promise<ManuscriptSource> {
  const result = await readManuscriptBytes(experiment, file, MAX_TEX_BYTES)
  return {
    text: new TextDecoder('utf-8', { fatal: true }).decode(result.bytes),
    size: result.size,
    mtime: result.mtime
  }
}

export async function statManuscriptSource(
  experiment: ResearchWorkspaceFileOwner,
  file: ManuscriptFile
): Promise<{ size: number; mtime: number; ctime?: number }> {
  const snapshot = await statRuntimeReadTarget(manuscriptReadTarget(experiment, file))
  if (snapshot.isDirectory) {
    throw new Error('Choose a file, not a directory.')
  }
  return { size: snapshot.size, mtime: snapshot.mtime, ctime: snapshot.ctime }
}

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = []
  const stride = 24 * 1024
  for (let offset = 0; offset < bytes.length; offset += stride) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + stride))))
  }
  return parts.join('')
}

export async function readManuscriptPdf(
  experiment: ResearchWorkspaceFileOwner,
  file: ManuscriptFile,
  maxBytes = MAX_PDF_BYTES
): Promise<ManuscriptPdf> {
  const result = await readManuscriptBytes(experiment, file, maxBytes)
  if (
    result.bytes.length < 5 ||
    new TextDecoder().decode(result.bytes.subarray(0, 5)) !== '%PDF-'
  ) {
    throw new Error('The selected file is not a PDF.')
  }
  return { base64: bytesToBase64(result.bytes), size: result.size, mtime: result.mtime }
}
