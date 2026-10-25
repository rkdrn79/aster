import '../unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import { saveResearchDocument } from '../../../research/research-repository'
import { RESEARCH_RECORD_METHODS } from './research-records'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('../../../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => fixture.directory
}))

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this read-only method does not use the runtime; the dispatcher only needs its id for the reply envelope.
const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService

beforeEach(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'aster-research-rpc-'))
})

afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

describe('research.records.read', () => {
  it('reads the same persisted records as the desktop without changing selection or revision', async () => {
    const document = emptyResearchDocument()
    const experimentId = '13933924-8c4a-4ced-8e68-b9588a899f12'
    document.experiments.push({
      id: experimentId,
      name: 'Baseline',
      projectId: null,
      workspaceId: 'workspace-1',
      workspacePath: '/research/baseline',
      hostId: 'test-runtime',
      archived: false,
      createdAt: '2026-10-23T00:00:00.000Z',
      updatedAt: '2026-10-23T00:00:00.000Z'
    })
    const saved = await saveResearchDocument(document)
    const dispatcher = new RpcDispatcher({ runtime, methods: RESEARCH_RECORD_METHODS })

    const response = await dispatcher.dispatch({
      id: 'read-1',
      authToken: 'token',
      method: 'research.records.read'
    })

    expect(response).toMatchObject({ ok: true, result: saved })
    expect(saved.revision).toBe(1)
    expect(saved.selectedExperimentId).toBeNull()
  })

  it('does not offer a mutation method to a paired client', async () => {
    const dispatcher = new RpcDispatcher({ runtime, methods: RESEARCH_RECORD_METHODS })
    const response = await dispatcher.dispatch({
      id: 'save-1',
      authToken: 'token',
      method: 'research.records.save',
      params: emptyResearchDocument()
    })

    expect(response).toMatchObject({ ok: false, error: { code: 'method_not_found' } })
  })

  it('reads a bounded log through its saved Run identity', async () => {
    const document = emptyResearchDocument()
    const experimentId = '13933924-8c4a-4ced-8e68-b9588a899f12'
    const runId = '1fd7e756-dfbc-4503-a810-a659a26fed0f'
    document.experiments.push({
      id: experimentId,
      name: 'Baseline',
      projectId: null,
      workspaceId: 'workspace-1',
      workspacePath: '/research/baseline',
      hostId: 'local',
      archived: false,
      createdAt: '2026-10-23T00:00:00.000Z',
      updatedAt: '2026-10-23T00:00:00.000Z'
    })
    document.runs.push({
      id: runId,
      experimentId,
      name: 'Run 1',
      hostId: 'local',
      workspaceId: 'workspace-1',
      workspacePath: '/research/baseline',
      sourcePath: '/research/baseline/metrics.jsonl',
      format: 'jsonl',
      logPath: '/research/baseline/train.log',
      configPath: null,
      execution: 'unknown',
      reportedBy: 'unavailable',
      observedAt: null,
      createdAt: '2026-10-23T00:00:00.000Z'
    })
    await saveResearchDocument(document)
    const content = Buffer.from('latest step\n')
    const logRuntime = {
      getRuntimeId: () => 'test-runtime',
      statRuntimeFile: vi.fn(async () => ({ size: content.length, isDirectory: false, mtime: 1 })),
      readFileExplorerChunk: vi.fn(async () => ({
        contentBase64: content.toString('base64'),
        bytesRead: content.length,
        eof: true
      }))
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the tested handler uses only the three methods above; the dispatcher does not exercise other runtime services.
    const scopedRuntime = logRuntime as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({
      runtime: scopedRuntime,
      methods: RESEARCH_RECORD_METHODS
    })

    const response = await dispatcher.dispatch({
      id: 'log-1',
      authToken: 'token',
      method: 'research.run.logTail',
      params: { runId }
    })

    expect(response).toMatchObject({ ok: true, result: { text: 'latest step', truncated: false } })
    expect(logRuntime.readFileExplorerChunk).toHaveBeenCalledWith(
      'id:workspace-1',
      'train.log',
      0,
      content.length
    )
  })
})
