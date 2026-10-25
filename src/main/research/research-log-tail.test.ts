import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import type { ResearchRunRecord } from '../../shared/research/research-records'
import { readResearchLogTail } from './research-log-tail'

const run: ResearchRunRecord = {
  id: 'b5543eb6-a334-49b0-8939-54743e62931b',
  experimentId: 'a863f289-87ca-4546-8cd6-25e8433d55b0',
  name: 'baseline',
  hostId: 'local',
  workspaceId: 'workspace-1',
  workspacePath: '/research/baseline',
  sourcePath: '/research/baseline/metrics.jsonl',
  format: 'jsonl',
  logPath: '/research/baseline/logs/train.log',
  configPath: null,
  execution: 'unknown',
  reportedBy: 'unavailable',
  observedAt: null,
  createdAt: '2026-10-23T00:00:00.000Z'
}

function rig(content: string) {
  const bytes = Buffer.from(content)
  const runtime = {
    statRuntimeFile: vi.fn(async () => ({
      size: bytes.length,
      isDirectory: false,
      mtime: 4,
      ctime: 2
    })),
    readFileExplorerChunk: vi.fn(async () => ({
      contentBase64: bytes.toString('base64'),
      bytesRead: bytes.length,
      eof: true
    }))
  }
  return runtime
}

describe('paired desktop Research log tail', () => {
  it('reads a Run-owned local log using the workspace file boundary', async () => {
    const runtime = rig('step 1\nstep 2\n')
    expect(await readResearchLogTail(runtime, run)).toMatchObject({
      text: 'step 1\nstep 2',
      truncated: false
    })
    expect(runtime.readFileExplorerChunk).toHaveBeenCalledWith(
      'id:workspace-1',
      'logs/train.log',
      0,
      Buffer.byteLength('step 1\nstep 2\n')
    )
  })

  it('rejects another host and an escaping path before accessing files', async () => {
    const runtime = rig('data')
    await expect(readResearchLogTail(runtime, { ...run, hostId: 'ssh:other' })).rejects.toThrow(
      'unavailable'
    )
    await expect(
      readResearchLogTail(runtime, { ...run, logPath: '/research/baseline/../other/train.log' })
    ).rejects.toThrow('outside')
    expect(runtime.statRuntimeFile).not.toHaveBeenCalled()
  })

  it('rejects a changed source before returning the cached bytes', async () => {
    const runtime = rig('data\n')
    runtime.statRuntimeFile.mockResolvedValueOnce({
      size: 5,
      isDirectory: false,
      mtime: 4,
      ctime: 2
    })
    runtime.statRuntimeFile.mockResolvedValueOnce({
      size: 5,
      isDirectory: false,
      mtime: 5,
      ctime: 2
    })
    await expect(readResearchLogTail(runtime, run)).rejects.toThrow('changed while reading')
  })
})
