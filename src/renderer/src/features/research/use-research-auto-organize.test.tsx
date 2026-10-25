// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { useResearchAutoOrganize } from './use-research-auto-organize'
import type { ResearchRunSummariesState } from './use-research-run-summaries'

const organize = vi.fn(async () => ({ organized: 1 }))

function experiment(workspacePath: string): ExperimentRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Main',
    projectId: null,
    workspaceId: 'workspace',
    workspacePath,
    hostId: 'local',
    catalogSlug: 'main',
    archived: false,
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z'
  }
}

function run(
  workspacePath: string,
  id: string,
  execution: ResearchRunRecord['execution']
): ResearchRunRecord {
  const folder = `${workspacePath}/research/experiments/main/runs/${id}`
  return {
    id: `run-${id}`,
    experimentId: '00000000-0000-4000-8000-000000000001',
    name: id,
    hostId: 'local',
    workspaceId: 'workspace',
    workspacePath,
    sourcePath: `${folder}/metrics.jsonl`,
    format: 'jsonl',
    logPath: null,
    configPath: null,
    manifestPath: `${folder}/run.json`,
    execution,
    reportedBy: 'manifest',
    observedAt: null,
    createdAt: '2026-10-24T00:00:00Z'
  }
}

function summaryOf(reference: string, state: string): ResearchRunSummary {
  return {
    run: reference,
    generatedAt: '2026-10-24T00:00:00Z',
    state,
    exitCode: 0,
    durationMs: 1000,
    primary: null,
    baseline: null,
    findings: { fail: 0, warn: 0, info: 0 },
    media: { image: 0, video: 0, audio: 0 },
    outputs: null,
    notes: []
  }
}

function summaries(
  byRun: [string, ResearchRunSummary | null][],
  loading = false
): ResearchRunSummariesState {
  return {
    available: true,
    byRun: new Map(byRun),
    loading,
    error: null,
    refresh: vi.fn(async () => {})
  }
}

function Probe(props: {
  workspacePath: string
  runs: ResearchRunRecord[]
  summaries: ResearchRunSummariesState
}): null {
  useResearchAutoOrganize(experiment(props.workspacePath), props.runs, props.summaries)
  return null
}

describe('useResearchAutoOrganize', () => {
  let root: Root

  beforeEach(() => {
    organize.mockClear()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { researchOrganize: { organize } }
    })
    root = createRoot(document.createElement('div'))
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  it('organizes an ended Run once per session, after its summaries were read', async () => {
    const workspacePath = '/projects/once'
    const runs = [run(workspacePath, 'done', 'succeeded'), run(workspacePath, 'live', 'running')]
    const render = (state: ResearchRunSummariesState): Promise<void> =>
      act(async () => root.render(createElement(Probe, { workspacePath, runs, summaries: state })))

    await render(summaries([], true))
    expect(organize).not.toHaveBeenCalled()
    // A summary written while the Run was still running is older than its end.
    const stale = summaries([
      ['main/done', summaryOf('main/done', 'running')],
      ['main/live', null]
    ])
    await render(stale)
    expect(organize).toHaveBeenCalledTimes(1)
    expect(organize).toHaveBeenCalledWith({ workspacePath, run: 'main/done' })
    expect(stale.refresh).toHaveBeenCalled()
    await render(summaries([['main/done', null]]))
    expect(organize).toHaveBeenCalledTimes(1)
  })

  it('organizes the whole Experiment when several ended Runs lack a current summary', async () => {
    const workspacePath = '/projects/several'
    const runs = ['a', 'b', 'c'].map((id) =>
      run(workspacePath, id, id === 'c' ? 'failed' : 'succeeded')
    )
    const state = summaries([
      ['main/a', null],
      ['main/b', null],
      ['main/c', summaryOf('main/c', 'failed')]
    ])
    await act(async () =>
      root.render(createElement(Probe, { workspacePath, runs, summaries: state }))
    )
    expect(organize).toHaveBeenCalledTimes(1)
    expect(organize).toHaveBeenCalledWith({ workspacePath, experiment: 'main' })
  })
})
