import { Buffer } from 'node:buffer'
import { relativePathInsideRoot } from '../../shared/cross-platform-path'
import type { ResearchRunRecord } from '../../shared/research/research-records'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

const READ_BYTES = 32 * 1024
const DISPLAY_LINES = 40

export type ResearchLogTail = {
  text: string
  truncated: boolean
  readAt: string
}

export async function readResearchLogTail(
  runtime: Pick<OrcaRuntimeService, 'statRuntimeFile' | 'readFileExplorerChunk'>,
  run: ResearchRunRecord
): Promise<ResearchLogTail> {
  if (run.hostId !== 'local') {
    throw new Error('Mobile log reading is unavailable for this Run host.')
  }
  if (!run.logPath) {
    throw new Error('No log is linked to this Run.')
  }
  const relativePath = relativePathInsideRoot(run.workspacePath, run.logPath)
  if (!relativePath?.trim() || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error('The linked log is outside the Run workspace.')
  }
  const worktree = `id:${run.workspaceId}`
  const stat = await runtime.statRuntimeFile(worktree, relativePath)
  if (stat.isDirectory) {
    throw new Error('The linked log is a directory.')
  }
  if (stat.size === 0) {
    return { text: '', truncated: false, readAt: new Date().toISOString() }
  }
  const offset = Math.max(0, stat.size - READ_BYTES)
  const length = stat.size - offset
  const chunk = await runtime.readFileExplorerChunk(worktree, relativePath, offset, length)
  const bytes = Buffer.from(chunk.contentBase64, 'base64')
  if (bytes.length !== length || chunk.bytesRead !== length) {
    throw new Error('The log changed while reading. Refresh to try again.')
  }
  const latest = await runtime.statRuntimeFile(worktree, relativePath)
  if (
    latest.isDirectory ||
    latest.size !== stat.size ||
    latest.mtime !== stat.mtime ||
    (stat.ctime !== undefined && latest.ctime !== stat.ctime)
  ) {
    throw new Error('The log changed while reading. Refresh to try again.')
  }

  const decoded = new TextDecoder('utf-8').decode(bytes)
  const firstCompleteLine = decoded.indexOf('\n')
  const complete =
    offset === 0 ? decoded : firstCompleteLine === -1 ? '' : decoded.slice(firstCompleteLine + 1)
  const lines = complete.split(/\r?\n/)
  if (lines.at(-1) === '') {
    lines.pop()
  }
  const visible = lines.slice(-DISPLAY_LINES)
  return {
    text: visible.join('\n'),
    truncated: offset > 0 || lines.length > visible.length,
    readAt: new Date().toISOString()
  }
}
