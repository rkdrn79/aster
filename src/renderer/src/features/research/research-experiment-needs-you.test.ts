import { describe, expect, it } from 'vitest'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { experimentNeedsYou } from './research-experiment-needs-you'
import {
  findingRecord,
  proposalRecord,
  runRecord
} from './research-experiment-notebook.test-fixture'

describe('Experiment Needs you', () => {
  const runs = [
    runRecord('broken', 'failed'),
    runRecord('cand', 'succeeded'),
    runRecord('attached', 'failed', { manifestPath: null })
  ]
  const statusOf = (entry: ResearchRunRecord) => ({ state: entry.execution })
  const failed = findingRecord('rule:run.failed:exp/broken', {
    check: 'run.failed',
    severity: 'fail',
    runs: ['exp/broken']
  })
  const input = {
    runs,
    statusOf,
    findings: [
      failed,
      findingRecord('warn-1', {
        severity: 'warn',
        source: 'agent',
        createdAt: '2026-10-24T11:00:00Z'
      }),
      findingRecord('fail-1', { severity: 'fail', createdAt: '2026-10-24T07:00:00Z' }),
      findingRecord('rule:repro.commit-unknown:exp/cand', { severity: 'info' }),
      findingRecord('warn-2', { severity: 'warn', status: 'dismissed' })
    ],
    proposals: [
      proposalRecord('pending-1', 'pending'),
      proposalRecord('approved-config', 'approved'),
      proposalRecord('approved-code', 'approved', { needsCode: true }),
      proposalRecord('handed-off', 'approved', {
        needsCode: true,
        handoff: { at: '2026-10-24T10:00:00Z', sessionId: 'session-1' }
      }),
      proposalRecord('launched', 'launched')
    ],
    dismissedRuns: new Set<string>()
  }

  it('asks only for decisions: failures, pending proposals, code to hand off, then warnings', () => {
    const items = experimentNeedsYou(input)
    expect(items.map((item) => item.key)).toEqual([
      'run:broken',
      'run:attached',
      'finding:fail-1',
      'proposal:pending-1',
      'handoff:approved-code',
      'finding:warn-1'
    ])
    expect(items[0]).toMatchObject({ kind: 'failed-run', finding: { id: failed.id } })
  })

  it('drops a failed Run once its finding is closed, or once dismissed without a finding', () => {
    const items = experimentNeedsYou({
      ...input,
      findings: [{ ...failed, status: 'dismissed' }],
      proposals: [],
      dismissedRuns: new Set(['run:attached'])
    })
    expect(items).toEqual([])
  })
})
