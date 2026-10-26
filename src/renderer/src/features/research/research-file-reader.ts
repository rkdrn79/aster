import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { getRelativePathInsideWorktree } from '@/runtime/runtime-file-routing'
import { readRuntimeFileRange, statRuntimeReadTarget } from '@/runtime/runtime-file-range-client'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/runtime-client-target'
import { authorityKey, parseHostAuthorityKey } from '../../../../shared/host-authority'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { MAX_FILE_RANGE_READ_BYTES } from '../../../../shared/file-range-read'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'

const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const CHUNK_BYTES = MAX_FILE_RANGE_READ_BYTES

export type ResearchTextTail = {
  text: string
  truncated: boolean
  sourceSize: number
}

export function decodeResearchLogTail(
  bytes: Uint8Array,
  start: number,
  precedingByte: number | null
): string {
  const decoded = new TextDecoder('utf-8').decode(bytes)
  if (start === 0 || precedingByte === 10) {
    return decoded
  }
  const firstLineEnd = decoded.indexOf('\n')
  return firstLineEnd === -1 ? decoded : decoded.slice(firstLineEnd + 1)
}

type ResearchWorkspaceReadScope = Pick<
  ResearchRunRecord,
  'hostId' | 'workspaceId' | 'workspacePath'
>

function researchReadTarget(run: ResearchWorkspaceReadScope, path: string) {
  const authority = parseHostAuthorityKey(run.hostId)
  if (!authority || (authority.endpoint.kind === 'environment' && authority.at !== 'local')) {
    throw new Error('This host does not support bounded research file reads.')
  }
  const target = runtimeRpcTargetForAuthorityKey(authorityKey(authority))
  if (!target) {
    throw new Error('This host does not support bounded research file reads.')
  }
  const relativePath = getRelativePathInsideWorktree(run.workspacePath, path)
  if (relativePath === null) {
    throw new Error('Choose a file inside the connected workspace.')
  }
  const ssh = authority.endpoint.kind === 'self' ? parseExecutionHostId(authority.at) : null
  return {
    target,
    filePath: path,
    relativePath,
    worktreeId: run.workspaceId,
    ...(ssh?.kind === 'ssh'
      ? { connectionId: ssh.targetId, expectedExternalSshTargetId: ssh.targetId }
      : {}),
    access: { kind: 'research-workspace' as const, workspacePath: run.workspacePath }
  }
}

export async function researchFileExists(
  run: ResearchWorkspaceReadScope,
  path: string
): Promise<boolean> {
  try {
    const target = researchReadTarget(run, path)
    // Why: a miss is a normal answer here, and a rejected fs:stat is logged by main on every poll.
    if (
      target.target.kind !== 'environment' &&
      !(await window.api.fs.pathExists({
        filePath: target.filePath,
        connectionId: target.connectionId,
        access: target.access
      }))
    ) {
      return false
    }
    return !(await statRuntimeReadTarget(target)).isDirectory
  } catch {
    return false
  }
}

export async function readResearchTextFile(
  run: ResearchWorkspaceReadScope,
  path: string,
  maxBytes = MAX_SOURCE_BYTES
): Promise<string> {
  const args = researchReadTarget(run, path)
  const snapshot = await statRuntimeReadTarget(args)
  if (snapshot.isDirectory) {
    throw new Error('Choose a file, not a directory.')
  }
  if (snapshot.size > maxBytes) {
    throw new Error(`Source exceeds the ${maxBytes / 1024 / 1024} MiB read limit.`)
  }
  const bytes = new Uint8Array(snapshot.size)
  for (let offset = 0; offset < snapshot.size; offset += CHUNK_BYTES) {
    const length = Math.min(CHUNK_BYTES, snapshot.size - offset)
    const chunk = await readRuntimeFileRange(args, offset, length)
    if (chunk.length !== length) {
      throw new Error('Source changed during reading. Refresh to retry.')
    }
    bytes.set(chunk, offset)
  }
  const after = await statRuntimeReadTarget(args)
  if (after.size !== snapshot.size || after.mtime !== snapshot.mtime) {
    throw new Error('Source changed during reading. Refresh to observe the new version.')
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** Only raster images inside the Run's workspace can be rendered in comparisons. */
export async function readResearchImageBlobUrl(
  run: ResearchWorkspaceReadScope,
  path: string
): Promise<string> {
  const args = researchReadTarget(run, resolveRuntimePath(run.workspacePath, path))
  const snapshot = await statRuntimeReadTarget(args)
  if (snapshot.isDirectory || snapshot.size < 12 || snapshot.size > 5 * 1024 * 1024) {
    throw new Error('Image must be a PNG, JPEG or WebP file of at most 5 MiB.')
  }
  const bytes = new Uint8Array(snapshot.size)
  for (let offset = 0; offset < snapshot.size; offset += CHUNK_BYTES) {
    const length = Math.min(CHUNK_BYTES, snapshot.size - offset)
    const chunk = await readRuntimeFileRange(args, offset, length)
    if (chunk.length !== length) {
      throw new Error('Image changed during reading. Refresh to retry.')
    }
    bytes.set(chunk, offset)
  }
  const after = await statRuntimeReadTarget(args)
  if (after.size !== snapshot.size || after.mtime !== snapshot.mtime) {
    throw new Error('Image changed during reading. Refresh to retry.')
  }
  const mimeType =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      ? 'image/png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? 'image/jpeg'
        : bytes[0] === 0x52 &&
            bytes[1] === 0x49 &&
            bytes[2] === 0x46 &&
            bytes[3] === 0x46 &&
            bytes[8] === 0x57 &&
            bytes[9] === 0x45 &&
            bytes[10] === 0x42 &&
            bytes[11] === 0x50
          ? 'image/webp'
          : null
  if (!mimeType) {
    throw new Error('Only PNG, JPEG and WebP output images are supported.')
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

export async function readResearchTextTail(
  run: ResearchRunRecord,
  path: string
): Promise<ResearchTextTail> {
  const args = researchReadTarget(run, path)
  const snapshot = await statRuntimeReadTarget(args)
  if (snapshot.isDirectory) {
    throw new Error('Choose a file, not a directory.')
  }
  if (snapshot.size === 0) {
    return { text: '', truncated: false, sourceSize: 0 }
  }
  const start = Math.max(0, snapshot.size - MAX_FILE_RANGE_READ_BYTES)
  const [bytes, preceding] = await Promise.all([
    readRuntimeFileRange(args, start, snapshot.size - start),
    start > 0 ? readRuntimeFileRange(args, start - 1, 1) : Promise.resolve(null)
  ])
  const after = await statRuntimeReadTarget(args)
  if (
    bytes.length !== snapshot.size - start ||
    (preceding !== null && preceding.length !== 1) ||
    after.size !== snapshot.size ||
    after.mtime !== snapshot.mtime
  ) {
    throw new Error('Log changed during reading. Refresh to retry.')
  }
  return {
    text: decodeResearchLogTail(bytes, start, preceding?.[0] ?? null),
    truncated: start > 0,
    sourceSize: snapshot.size
  }
}
