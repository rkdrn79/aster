import type { RuntimeFileReadChunkResult } from '../../../shared/runtime-types'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import {
  MAX_FILE_RANGE_READ_BYTES,
  validateFileRangeRequest
} from '../../../shared/file-range-read'
import type { RuntimeFileReadArgs } from './runtime-file-client-types'
import { assertExternalSshReadOwnership, canReadRelativeRuntimeFile } from './runtime-file-routing'
import { callRuntimeRpc } from './runtime-rpc-client'
import { RuntimeRpcCallError } from './runtime-rpc-result'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'
import { captureRuntimeEnvironmentRequestRevision } from './runtime-environment-revision'
import { PRODUCT_NAME } from '../../../shared/product-brand'
import { decodeBase64Bytes } from '@/lib/fast-base64'

/** Under `files.readChunk`'s 512 KiB cap (hosts since September), and a multiple of 3 so its
 *  base64 carries no padding. Local IPC keeps the stricter shared range cap. */
export const REMOTE_FILE_BLOCK_BYTES = 384 * 1024
// Why 4: the app's per-host RPC queue runs 8 calls at once; whole-file reads leave half for
// everything else, and four replies in flight keep a 50 ms, 10 MB/s link busy.
const REMOTE_FILE_BLOCK_CONCURRENCY = 4
const LOCAL_FILE_BLOCK_CONCURRENCY = 4

/** A file on a paired runtime, addressed the way its host's `files.*` methods expect. */
export type RuntimeRemoteFileAddress = {
  target: Extract<RuntimeClientTarget, { kind: 'environment' }>
  worktree: string
  relativePath: string
  /** Pins a multi-call read to one pairing, so a re-pair cannot switch hosts mid-read. */
  expectedEnvironmentPairingRevision?: number
}

function rangeReadTarget(args: RuntimeFileReadArgs): RuntimeRemoteFileAddress | null {
  assertExternalSshReadOwnership(args.target, args.connectionId, args.expectedExternalSshTargetId)
  const target = args.target
  if (target.kind !== 'environment') {
    return null
  }
  if (!args.worktreeId) {
    throw new Error('Remote file has no owning runtime worktree')
  }
  if (!canReadRelativeRuntimeFile(args.relativePath)) {
    throw new Error('Remote file is outside the owning runtime worktree')
  }
  return {
    target,
    worktree: toRuntimeWorktreeSelector(args.worktreeId),
    relativePath: args.relativePath
  }
}

export type RuntimeFileSnapshot = {
  size: number
  isDirectory: boolean
  mtime: number
  ctime?: number
}

export function statRemoteRuntimeFile(
  remote: RuntimeRemoteFileAddress
): Promise<RuntimeFileSnapshot> {
  return callRuntimeRpc<RuntimeFileSnapshot>(
    remote.target,
    'files.stat',
    { worktree: remote.worktree, relativePath: remote.relativePath },
    {
      timeoutMs: 15_000,
      expectedEnvironmentPairingRevision: remote.expectedEnvironmentPairingRevision
    }
  )
}

export function readRemoteRuntimeFileChunk(
  remote: RuntimeRemoteFileAddress,
  offset: number,
  length: number
): Promise<RuntimeFileReadChunkResult> {
  return callRuntimeRpc<RuntimeFileReadChunkResult>(
    remote.target,
    'files.readChunk',
    { worktree: remote.worktree, relativePath: remote.relativePath, offset, length },
    {
      timeoutMs: 60_000,
      expectedEnvironmentPairingRevision: remote.expectedEnvironmentPairingRevision
    }
  )
}

export async function statRuntimeReadTarget(
  args: RuntimeFileReadArgs
): Promise<RuntimeFileSnapshot> {
  const remote = rangeReadTarget(args)
  if (!remote) {
    return window.api.fs.stat({
      filePath: args.filePath,
      connectionId: args.connectionId,
      access: args.access
    })
  }
  return statRemoteRuntimeFile(remote)
}

export async function readRuntimeFileRange(
  args: RuntimeFileReadArgs,
  offset: number,
  length: number
): Promise<Uint8Array<ArrayBuffer>> {
  validateFileRangeRequest(offset, length)
  const remote = rangeReadTarget(args)
  let result: RuntimeFileReadChunkResult
  try {
    result = remote
      ? await readRemoteRuntimeFileChunk(remote, offset, length)
      : await window.api.fs.readFileChunk({
          filePath: args.filePath,
          connectionId: args.connectionId,
          access: args.access,
          offset,
          length
        })
  } catch (error) {
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      throw new Error(
        `Large CSV previews require a newer ${PRODUCT_NAME} server. Update the server and retry.`
      )
    }
    throw error
  }
  const bytes = decodeBase64Bytes(result.contentBase64)
  if (bytes.length !== result.bytesRead || bytes.length > length || bytes.length === 0) {
    throw new Error('File changed or returned an invalid CSV chunk. Reload the preview.')
  }
  return bytes
}

export type RuntimeFileBlockReader = {
  /** True when the bytes cross a paired-runtime link rather than this machine's IPC. */
  remote: boolean
  blockBytes: number
  concurrency: number
  read: (offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>>
}

/** Whole-file reads in blocks: larger ones over a paired runtime, pinned to its current pairing. */
export function runtimeFileBlockReader(args: RuntimeFileReadArgs): RuntimeFileBlockReader {
  const address = rangeReadTarget(args)
  if (!address) {
    return {
      remote: false,
      blockBytes: MAX_FILE_RANGE_READ_BYTES,
      concurrency: LOCAL_FILE_BLOCK_CONCURRENCY,
      read: (offset, length) => readRuntimeFileRange(args, offset, length)
    }
  }
  const remote: RuntimeRemoteFileAddress = {
    ...address,
    expectedEnvironmentPairingRevision: captureRuntimeEnvironmentRequestRevision(
      address.target.environmentId,
      address.expectedEnvironmentPairingRevision
    )
  }
  return {
    remote: true,
    blockBytes: REMOTE_FILE_BLOCK_BYTES,
    concurrency: REMOTE_FILE_BLOCK_CONCURRENCY,
    read: async (offset, length) => {
      const result = await readRemoteRuntimeFileChunk(remote, offset, length)
      const bytes = decodeBase64Bytes(result.contentBase64)
      if (bytes.length !== result.bytesRead) {
        throw new Error('The host returned an invalid file chunk.')
      }
      return bytes
    }
  }
}
