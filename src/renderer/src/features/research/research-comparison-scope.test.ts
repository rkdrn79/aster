import { describe, expect, it } from 'vitest'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import { experimentCheckedRuns, toggleExperimentComparison } from './research-comparison-scope'

const EXPERIMENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EXPERIMENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function run(id: string, experimentId: string): ResearchRunRecord {
  return {
    id,
    experimentId,
    name: id,
    hostId: 'local',
    workspaceId: 'worktree-a',
    workspacePath: '/research',
    sourcePath: '/research/metrics.jsonl',
    format: 'jsonl',
    logPath: null,
    configPath: null,
    execution: 'unknown',
    reportedBy: 'unavailable',
    observedAt: null,
    createdAt: '2026-10-24T00:00:00Z'
  }
}

describe('Experiment comparison scope', () => {
  const runs = [
    run('a-1', EXPERIMENT_A),
    run('a-2', EXPERIMENT_A),
    run('b-1', EXPERIMENT_B),
    run('b-2', EXPERIMENT_B)
  ]

  it('shows only the checked Runs of the Experiment, in check order', () => {
    const document = { runs, comparisonRunIds: ['b-1', 'a-2', 'a-1'] }
    expect(experimentCheckedRuns(document, EXPERIMENT_A).map((entry) => entry.id)).toEqual([
      'a-2',
      'a-1'
    ])
  })

  it('drops other Experiments when a Run is toggled and keeps the stored baseline valid', () => {
    const document = {
      ...emptyResearchDocument(),
      runs,
      comparisonRunIds: ['b-1', 'b-2', 'a-1'],
      baselineRunId: 'b-1'
    }
    const next = toggleExperimentComparison(document, 'a-2')
    expect(next.comparisonRunIds).toEqual(['a-1', 'a-2'])
    expect(next.baselineRunId).toBe('a-1')
    const unchecked = toggleExperimentComparison(next, 'a-1')
    expect(unchecked.comparisonRunIds).toEqual(['a-2'])
    expect(unchecked.baselineRunId).toBe('a-2')
  })

  it('refuses a Run past the limit', () => {
    const document = { ...emptyResearchDocument(), runs, comparisonRunIds: ['a-1'] }
    expect(toggleExperimentComparison(document, 'a-2', 1)).toBe(document)
  })
})
