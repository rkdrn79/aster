import { describe, expect, it } from 'vitest'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { openFindingsByRun, sortFindings, worstFindingSeverity } from './research-findings-format'

function finding(overrides: Partial<ResearchFinding>): ResearchFinding {
  return {
    id: 'finding-1',
    source: 'agent',
    check: 'eval.overfit',
    layer: 'integrity',
    severity: 'warn',
    status: 'open',
    experiment: 'main',
    runs: ['main/a'],
    samples: [],
    text: 'x',
    evidence: [],
    createdAt: '2026-10-24T00:00:00.000Z',
    ...overrides
  }
}

describe('research findings format', () => {
  it('keys only open findings by Run, worst severity first', () => {
    const findings = [
      finding({ id: 'info', severity: 'info', runs: ['main/a', 'main/b'] }),
      finding({ id: 'fail', severity: 'fail' }),
      finding({ id: 'dismissed', severity: 'fail', status: 'dismissed', runs: ['main/b'] })
    ]
    const byRun = openFindingsByRun(findings)
    expect(byRun.get('main/a')?.map((item) => item.id)).toEqual(['fail', 'info'])
    expect(byRun.get('main/b')?.map((item) => item.id)).toEqual(['info'])
    expect(worstFindingSeverity(byRun.get('main/a') ?? [])).toBe('fail')
    expect(worstFindingSeverity([])).toBeNull()
  })

  it('sorts open before closed, then by severity, then newest first', () => {
    const sorted = sortFindings([
      finding({ id: 'old-warn', createdAt: '2026-10-01T00:00:00.000Z' }),
      finding({ id: 'resolved-fail', severity: 'fail', status: 'resolved' }),
      finding({ id: 'new-warn', createdAt: '2026-10-20T00:00:00.000Z' }),
      finding({ id: 'fail', severity: 'fail' })
    ])
    expect(sorted.map((item) => item.id)).toEqual(['fail', 'new-warn', 'old-warn', 'resolved-fail'])
  })
})
