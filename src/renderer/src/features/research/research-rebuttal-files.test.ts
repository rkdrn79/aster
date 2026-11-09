import { beforeEach, describe, expect, it, vi } from 'vitest'

type RemoteWrite = { filePath: string; content: string; precondition: unknown }

const runtime = vi.hoisted(() => {
  const writes: RemoteWrite[] = []
  const created: string[] = []
  return { writes, created, ok: true }
})

vi.mock('@/lib/workspace-file-host-routing', () => ({
  buildWorkspaceFileContext: () => ({ connectionId: 'ssh-1', target: { kind: 'runtime-host' } })
}))
vi.mock('@/runtime/runtime-file-read-client', () => ({ readRuntimeFileContent: vi.fn() }))
vi.mock('@/runtime/runtime-file-range-client', () => ({ statRuntimeReadTarget: vi.fn() }))
vi.mock('@/runtime/runtime-file-routing', () => ({ getRelativePathInsideWorktree: () => null }))
vi.mock('@/runtime/runtime-file-mutation-client', () => ({
  readRuntimeDirectory: async () => [{ name: 'rebuttal', isDirectory: true }],
  createRuntimePath: async (_context: unknown, path: string) => runtime.created.push(path),
  writeRuntimeFile: async (
    _context: unknown,
    filePath: string,
    content: string,
    _access: unknown,
    precondition: unknown
  ) => {
    runtime.writes.push({ filePath, content, precondition })
    return { ok: runtime.ok }
  }
}))

import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'
import {
  RebuttalWriteConflict,
  writeRebuttalText,
  type RebuttalOwner
} from './research-rebuttal-files'

const owner: RebuttalOwner = {
  hostId: 'ssh-1',
  workspaceId: 'ws',
  workspacePath: '/remote/project'
}

describe('rebuttal file writes on a remote host', () => {
  beforeEach(() => {
    runtime.writes.length = 0
    runtime.created.length = 0
    runtime.ok = true
  })

  it('replaces an existing file through the conditional text write', async () => {
    await writeRebuttalText(owner, '.aster/rebuttal/iclr/clusters.json', 'new', 'old')
    expect(runtime.writes).toEqual([
      {
        filePath: '/remote/project/.aster/rebuttal/iclr/clusters.json',
        content: 'new',
        precondition: { expectedSignature: getDiskBaselineSignature('old') }
      }
    ])
  })

  it('creates a new file only when it is still absent', async () => {
    await writeRebuttalText(owner, '.aster/rebuttal/iclr/history/C1.json', 'new', null)
    expect(runtime.writes[0].precondition).toEqual({
      expectedSignature: getDiskBaselineSignature(''),
      allowMissing: true
    })
  })

  it('reports a changed file as a conflict instead of overwriting it', async () => {
    runtime.ok = false
    await expect(
      writeRebuttalText(owner, '.aster/rebuttal/iclr/clusters.json', 'new', 'old')
    ).rejects.toBeInstanceOf(RebuttalWriteConflict)
  })
})
