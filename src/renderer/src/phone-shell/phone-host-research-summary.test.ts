import { describe, expect, it } from 'vitest'
import type { ResearchComputeJob } from '../../../shared/research/research-compute-api'
import type { ResearchDeadlineEntry } from '../../../shared/research/research-deadlines-api'
import {
  computeJobDetail,
  computeQueueSummary,
  nextPhoneDeadlines,
  phoneComputeJobs
} from './phone-host-research-summary'

function job(id: string, overrides: Partial<ResearchComputeJob>): ResearchComputeJob {
  return {
    id,
    name: id,
    state: 'running',
    slurmState: 'R',
    reason: null,
    gpus: 1,
    elapsed: '1:00:00',
    startTime: null,
    submitTime: null,
    timeLimit: null,
    nodes: null,
    partition: 'gpu',
    project: null,
    heldByBudget: false,
    ...overrides
  }
}

function deadline(label: string, at: string, actionable = true): ResearchDeadlineEntry {
  return {
    editionId: null,
    series: null,
    conference: 'ICML 2027',
    stage: 'submission',
    label,
    at,
    opensAt: null,
    stated: { date: at, timezone: 'UTC' },
    aoeAssumed: false,
    submission: null,
    actionable,
    link: null,
    source: 'custom',
    agreement: null
  }
}

describe('phone host research summary', () => {
  it('keeps the next actionable deadlines that have not passed', () => {
    const now = Date.parse('2026-10-30T00:00:00Z')
    const entries = [
      deadline('Gone', '2026-10-29T00:00:00Z'),
      deadline('Done already', '2026-11-01T00:00:00Z', false),
      deadline('Abstract', '2026-11-02T00:00:00Z'),
      deadline('Paper', '2026-11-09T00:00:00Z')
    ]
    expect(nextPhoneDeadlines(entries, now, 3).map((entry) => entry.label)).toEqual([
      'Abstract',
      'Paper'
    ])
  })

  it('summarizes the queue and lists running jobs before waiting ones', () => {
    const jobs = [
      job('48251', { state: 'pending', slurmState: 'PD', reason: 'Resources', gpus: 4 }),
      job('48213', { gpus: 2 }),
      job('48260', { state: 'held', slurmState: 'PD', heldByBudget: true })
    ]
    expect(computeQueueSummary(jobs, null)).toBe('1 running · 2 waiting · 2 GPUs running')
    expect(phoneComputeJobs(jobs).map((entry) => entry.id)).toEqual(['48213', '48251', '48260'])
    expect(computeJobDetail(jobs[2])).toBe('1 GPU · Held for the GPU budget')
  })
})
