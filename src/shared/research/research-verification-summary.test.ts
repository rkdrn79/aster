import { describe, expect, it } from 'vitest'
import { verificationSummary } from './research-verification-summary'

describe('verificationSummary', () => {
  it('keeps total counts while bounding details sent to the renderer', () => {
    const result = verificationSummary({
      checkedAt: '2026-10-25T00:00:00.000Z',
      scope: { experiment: 'ablation' },
      verdict: 'blocked',
      runCount: 4,
      projectValidation: {
        issues: ['a', 'b', 'c', 'd'],
        warnings: ['w1', 'w2', 'w3', 'w4']
      },
      briefGaps: [{ experiment: 'ablation', missing: ['question'] }],
      unfinished: Array.from({ length: 4 }, (_, index) => ({
        run: `ablation/run-${index}`,
        state: 'unknown'
      })),
      executionEvidence: [{ reportedBy: 'user' }, { reportedBy: 'manifest' }],
      findings: {
        counts: { fail: 1, warn: 2, info: 0 },
        open: Array.from({ length: 4 }, (_, index) => ({
          severity: 'warn',
          text: `Finding ${index}`,
          evidence: 'large raw data omitted'
        }))
      }
    })
    expect(result.validation).toMatchObject({ issueCount: 4, warningCount: 4 })
    expect(result.validation.issues).toEqual(['a', 'b', 'c'])
    expect(result.unfinished.count).toBe(4)
    expect(result.unfinished.runs).toHaveLength(3)
    expect(result.userReportedCount).toBe(1)
    expect(result.findings.open[0]).toEqual({ severity: 'warn', text: 'Finding 0' })
  })

  it('rejects an unexpected result rather than reporting a clear verdict', () => {
    expect(() => verificationSummary({ verdict: 'checks_clear' })).toThrow()
  })
})
