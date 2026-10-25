import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'

export const EXPERIMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

export function runRecord(
  id: string,
  execution: ResearchRunRecord['execution'],
  patch: Partial<ResearchRunRecord> = {}
): ResearchRunRecord {
  return {
    id,
    experimentId: EXPERIMENT_ID,
    name: id,
    hostId: 'local',
    workspaceId: 'worktree',
    workspacePath: '/project',
    sourcePath: `/project/research/experiments/exp/runs/${id}/metrics.jsonl`,
    manifestPath: `/project/research/experiments/exp/runs/${id}/run.json`,
    format: 'jsonl',
    logPath: null,
    configPath: `/project/research/experiments/exp/runs/${id}/config.json`,
    execution,
    reportedBy: 'manifest',
    observedAt: '2026-10-24T09:00:00Z',
    createdAt: '2026-10-24T08:00:00Z',
    ...patch
  }
}

export function findingRecord(
  id: string,
  patch: Partial<ResearchFinding> & Pick<ResearchFinding, 'severity'>
): ResearchFinding {
  return {
    id,
    source: 'rule',
    check: 'run.no-metrics',
    layer: 'integrity',
    status: 'open',
    experiment: 'exp',
    runs: [],
    samples: [],
    text: id,
    evidence: [],
    createdAt: '2026-10-24T10:00:00Z',
    ...patch
  }
}

export function proposalRecord(
  id: string,
  state: ResearchProposal['state'],
  patch: Partial<ResearchProposal> = {}
): ResearchProposal {
  return {
    id,
    at: '2026-10-24T08:30:00Z',
    experiment: 'exp',
    title: id,
    rationale: '',
    command: 'python train.py',
    cwd: null,
    configChanges: null,
    findings: [],
    runs: [],
    state,
    decision:
      state === 'pending'
        ? null
        : {
            decision: state === 'rejected' ? 'rejected' : 'approved',
            note: null,
            by: 'user',
            at: '2026-10-24T09:30:00Z'
          },
    launchedRun: null,
    needsCode: false,
    handoff: null,
    ...patch
  }
}

export function summaryRecord(
  run: string,
  primary: { last: number; best?: number } | null,
  baseline: { run: string; delta: number } | null = null
): ResearchRunSummary {
  return {
    run,
    generatedAt: '2026-10-24T11:00:00Z',
    state: 'succeeded',
    exitCode: 0,
    durationMs: null,
    primary: primary
      ? {
          metric: 'acc',
          split: 'val',
          direction: 'maximize',
          last: { value: primary.last, step: 100 },
          best: { value: primary.best ?? primary.last, step: 100 }
        }
      : null,
    baseline: baseline
      ? {
          run: baseline.run,
          last: null,
          best: null,
          delta: { last: baseline.delta, best: baseline.delta }
        }
      : null,
    findings: { fail: 0, warn: 0, info: 0 },
    media: { image: 0, video: 0, audio: 0 },
    outputs: null,
    notes: []
  }
}
