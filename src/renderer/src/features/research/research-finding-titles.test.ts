import { describe, expect, it } from 'vitest'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { findingFix, findingPresentation } from './research-finding-titles'

function rule(
  check: string,
  text: string,
  overrides: Partial<ResearchFinding> = {}
): ResearchFinding {
  return {
    id: `rule:${check}:exp/lr-1e-3`,
    source: 'rule',
    check,
    layer: 'integrity',
    severity: 'warn',
    status: 'open',
    experiment: 'exp',
    runs: ['exp/lr-1e-3'],
    samples: [],
    text,
    evidence: [],
    createdAt: '2026-10-24T00:00:00.000Z',
    ...overrides
  }
}

const runName = (reference: string): string => (reference === 'exp/lr-1e-3' ? 'lr 1e-3' : reference)

describe('finding presentation', () => {
  it('names the Run and keeps rule IDs and PIDs out of the visible text', () => {
    expect(
      findingPresentation(rule('run.failed', 'Exited with code 1 after 1 s'), runName)
    ).toEqual({ title: 'Run lr 1e-3 failed', summary: 'Exited with code 1 after 1 s' })
    const exited = findingPresentation(
      rule(
        'run.harness-exited',
        'Marked running, but its run exec process (pid 6171) on this host has exited'
      ),
      runName
    )
    expect(exited.title).toBe('Run lr 1e-3 is marked running, but its launcher exited')
    expect(`${exited.title} ${exited.summary}`).not.toMatch(/pid|6171|run\.harness/u)
    expect(
      findingPresentation(
        rule(
          'stats.too-few-seeds',
          '1 Run with this config apart from the seed; the brief asks for 2'
        ),
        runName
      ).summary
    ).toBe('Only 1 seed of this config so far; the plan asks for 2')
  })

  it('reads claims by their ID and reason, with Run references as names', () => {
    const stale = rule(
      'claims.stale',
      'Claim lr1e4-loss "Loss drops to 0.41": exp/lr-1e-3 loss: metrics file changed since the claim was recorded',
      { evidence: [{ kind: 'claim', claim: 'lr1e4-loss' }] }
    )
    expect(findingPresentation(stale, runName)).toEqual({
      title: 'Claim lr1e4-loss is stale',
      summary: "The Run's metrics changed after the claim was recorded"
    })
    const mismatch = findingPresentation(
      rule(
        'claims.mismatch',
        'Claim acc "Acc is 85.8%": exp/lr-1e-3 acc: recorded 0.858, metrics now give 0.85'
      ),
      runName
    )
    expect(mismatch.summary).toBe('lr 1e-3 acc: recorded 0.858, metrics now give 0.85')
  })

  it('keeps an agent finding as written and an unknown rule as its text', () => {
    const agent = rule('stats.within-noise', 'Gain is within seed noise', { source: 'agent' })
    expect(findingPresentation(agent, runName)).toEqual({
      title: 'Gain is within seed noise',
      summary: null
    })
    expect(findingPresentation(rule('new.rule', 'Something new'), runName).title).toBe(
      'Something new'
    )
  })

  it('offers the fix that resolves the finding', () => {
    expect(findingFix(rule('run.harness-exited', 'x'))).toBe('mark-failed')
    expect(findingFix(rule('compare.baseline-missing', 'x'))).toBe('choose-baseline')
    expect(findingFix(rule('claims.stale', 'x'))).toBe('open-writing')
    expect(findingFix(rule('run.non-finite', 'x'))).toBeNull()
  })
})
