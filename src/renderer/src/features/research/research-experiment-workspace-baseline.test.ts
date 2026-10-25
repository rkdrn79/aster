import { describe, expect, it } from 'vitest'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import {
  baselineChoices,
  experimentBaseline,
  experimentComparedRuns
} from './research-experiment-workspace-baseline'

const THIS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function experiment(id: string, catalogSlug?: string): ExperimentRecord {
  return {
    id,
    name: id,
    projectId: null,
    workspaceId: 'worktree',
    workspacePath: '/project',
    hostId: 'local',
    catalogSlug,
    archived: false,
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z'
  }
}

function run(id: string, experimentId: string, catalog: string | null): ResearchRunRecord {
  return {
    id,
    experimentId,
    name: id,
    hostId: 'local',
    workspaceId: 'worktree',
    workspacePath: '/project',
    sourcePath: '/project/metrics.jsonl',
    manifestPath: catalog ? `/project/research/experiments/${catalog}/run.json` : null,
    format: 'jsonl',
    logPath: null,
    configPath: null,
    execution: 'succeeded',
    reportedBy: 'manifest',
    observedAt: null,
    createdAt: '2026-10-24T00:00:00Z'
  }
}

describe('Experiment baseline', () => {
  const base = run('base', OTHER, 'sweep/runs/base')
  const cand = run('cand', THIS, 'ablation/runs/cand')
  const file = run('file', THIS, null)
  const runs = [base, cand, file]

  it('takes the brief baseline of a catalog Experiment, even from another Experiment', () => {
    const baseline = experimentBaseline({
      experiment: experiment(THIS, 'ablation'),
      briefBaseline: 'sweep/base',
      runs,
      checked: [cand, file],
      storedBaselineId: 'file'
    })
    expect(baseline).toEqual({
      source: 'brief',
      reference: 'sweep/base',
      run: base,
      pending: false
    })
    const compared = experimentComparedRuns([cand, file], baseline.run)
    expect(compared.map((entry) => entry.id)).toEqual(['base', 'cand', 'file'])
    expect(
      baselineChoices(experiment(THIS, 'ablation'), baseline, compared).map(
        (choice) => choice.reference
      )
    ).toEqual(['sweep/base', 'ablation/cand'])
  })

  it('is pending until the brief is read and falls back to the checked Runs when it names none', () => {
    const input = { experiment: experiment(THIS, 'ablation'), runs, checked: [cand] }
    expect(
      experimentBaseline({ ...input, briefBaseline: undefined, storedBaselineId: null })
    ).toMatchObject({ run: null, pending: true })
    expect(
      experimentBaseline({ ...input, briefBaseline: null, storedBaselineId: null })
    ).toMatchObject({ source: 'stored', run: cand, pending: false })
  })

  it('keeps the stored Compare baseline outside the catalog', () => {
    const input = { experiment: experiment(THIS), briefBaseline: undefined, runs }
    expect(
      experimentBaseline({ ...input, checked: [cand, file], storedBaselineId: 'file' }).run
    ).toBe(file)
    expect(
      experimentBaseline({ ...input, checked: [cand, file], storedBaselineId: null }).run
    ).toBe(cand)
  })
})
