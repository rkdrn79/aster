// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'

const context: { current: Record<string, unknown> } = vi.hoisted(() => ({
  current: { target: { kind: 'local' } }
}))
const callRuntimeFileMutation = vi.hoisted(() =>
  vi.fn(async (_target: unknown, _method: string, _params: object, _timeoutMs: number) => ({
    ok: true
  }))
)
const writeRuntimeFile = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
const deleteRuntimePath = vi.hoisted(() => vi.fn(async () => undefined))
const renameRuntimePath = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/workspace-file-host-routing', () => ({
  buildWorkspaceFileContext: () => context.current
}))
vi.mock('@/runtime/runtime-file-mutation-rpc', () => ({ callRuntimeFileMutation }))
vi.mock('@/runtime/runtime-file-mutation-client', () => ({
  readRuntimeDirectory: vi.fn(async () => []),
  createRuntimePath: vi.fn(),
  deleteRuntimePath,
  renameRuntimePath,
  writeRuntimeFile
}))

import {
  ProjectWriteConflict,
  writeProjectBinary,
  writeProjectText
} from './research-project-files'

const owner = { hostId: 'runtime:env-1', workspaceId: 'wt-1', workspacePath: '/srv/proj' }
const writeFile = vi.fn(async () => undefined)

function remote(): RuntimeFileOperationArgs {
  return {
    target: { kind: 'environment', environmentId: 'env-1' },
    worktreeId: 'wt-1',
    worktreePath: '/srv/proj'
  }
}

beforeEach(() => {
  vi.stubGlobal('api', { researchFigures: { writeFile } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('writeProjectBinary', () => {
  it('sends a small export to the Aster server in one base64 write', async () => {
    context.current = remote()
    await writeProjectBinary(owner, 'paper/figures/method.pdf', new Uint8Array([37, 80, 68, 70]))
    expect(callRuntimeFileMutation).toHaveBeenCalledTimes(1)
    expect(callRuntimeFileMutation).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'files.writeBase64',
      expect.objectContaining({
        worktree: 'id:wt-1',
        relativePath: expect.stringMatching(/^paper\/figures\/\.method\.pdf\..+\.tmp$/),
        contentBase64: 'JVBERg=='
      }),
      30_000
    )
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('replaces an export that already exists: the temporary file takes its place', async () => {
    context.current = remote()
    const order: string[] = []
    callRuntimeFileMutation.mockImplementationOnce(async () => {
      order.push('write')
      return { ok: true }
    })
    deleteRuntimePath.mockImplementationOnce(async () => {
      order.push('delete')
    })
    renameRuntimePath.mockImplementationOnce(async () => {
      order.push('rename')
    })
    await writeProjectBinary(owner, 'paper/figures/method.pdf', new Uint8Array([1]))
    expect(order).toEqual(['write', 'delete', 'rename'])
    expect(deleteRuntimePath).toHaveBeenCalledWith(
      expect.anything(),
      '/srv/proj/paper/figures/method.pdf'
    )
    expect(renameRuntimePath).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^\/srv\/proj\/paper\/figures\/\.method\.pdf\..+\.tmp$/),
      '/srv/proj/paper/figures/method.pdf'
    )
  })

  it('keeps the old export when the upload fails, and removes the temporary file', async () => {
    context.current = remote()
    callRuntimeFileMutation.mockRejectedValueOnce(new Error('offline'))
    await expect(
      writeProjectBinary(owner, 'paper/figures/method.pdf', new Uint8Array([1]))
    ).rejects.toThrow('offline')
    expect(deleteRuntimePath).toHaveBeenCalledTimes(1)
    expect(deleteRuntimePath).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/\.method\.pdf\..+\.tmp$/)
    )
    expect(renameRuntimePath).not.toHaveBeenCalled()
  })

  it('slices a large export and appends after the first slice', async () => {
    context.current = remote()
    await writeProjectBinary(owner, 'paper/figures/big.png', new Uint8Array(900 * 1024))
    const calls = callRuntimeFileMutation.mock.calls
    expect(calls.map((call) => call[1])).toEqual([
      'files.writeBase64Chunk',
      'files.writeBase64Chunk',
      'files.writeBase64Chunk'
    ])
    expect(calls.map((call) => Reflect.get(call[2], 'append'))).toEqual([false, true, true])
  })

  it('writes through the desktop app on this machine, and refuses a legacy SSH route', async () => {
    context.current = { target: { kind: 'local' }, worktreeId: 'wt-1', worktreePath: '/srv/proj' }
    await writeProjectBinary(owner, 'paper/figures/method.pdf', new Uint8Array([1, 2, 3]))
    expect(writeFile).toHaveBeenCalledWith({
      filePath: '/srv/proj/paper/figures/method.pdf',
      contentBase64: 'AQID'
    })
    context.current = { ...context.current, connectionId: 'ssh-1' }
    await expect(
      writeProjectBinary(owner, 'paper/figures/x.pdf', new Uint8Array([1]))
    ).rejects.toThrow(/Aster server/)
  })
})

describe('writeProjectText', () => {
  it('refuses to overwrite a file that changed since it was read', async () => {
    context.current = remote()
    writeRuntimeFile.mockResolvedValueOnce({ ok: false })
    await expect(
      writeProjectText(owner, 'paper/figures/method.excalidraw', '{}', 'old')
    ).rejects.toBeInstanceOf(ProjectWriteConflict)
  })
})
