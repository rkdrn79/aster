import { describe, expect, it } from 'vitest'
import type { ResearchClaimAudit } from '../../../../shared/research/research-harness-results'
import {
  claimProblemText,
  claimsBySeverity,
  researchClaimsChipText
} from './research-claims-summary'

function claim(
  id: string,
  status: ResearchClaimAudit['status'],
  line: number | null
): ResearchClaimAudit {
  return {
    id,
    text: id,
    status,
    reasons: [],
    evidence: [],
    manuscript: null,
    location: line === null ? null : { file: 'research/manuscript/main.tex', line }
  }
}

describe('claims summary', () => {
  it('says how many claims there are and only the problems among them', () => {
    const summary = { total: 12, verified: 9, mismatch: 1, missingEvidence: 0, stale: 2 }
    expect(researchClaimsChipText(summary)).toBe('12 claims · 1 mismatch')
    expect(researchClaimsChipText({ ...summary, total: 1, mismatch: 2, missingEvidence: 1 })).toBe(
      '1 claim · 2 mismatches · 1 without evidence'
    )
    expect(
      researchClaimsChipText({ total: 0, verified: 0, mismatch: 0, missingEvidence: 0, stale: 0 })
    ).toBeNull()
  })

  it('puts problems first and keeps manuscript order within a status', () => {
    const ordered = claimsBySeverity([
      claim('verified-early', 'verified', 3),
      claim('stale', 'stale', 1),
      claim('mismatch-late', 'mismatch', 90),
      claim('unplaced-mismatch', 'mismatch', null),
      claim('mismatch-early', 'mismatch', 10),
      claim('no-evidence', 'missing-evidence', 50)
    ])
    expect(ordered.map((entry) => entry.id)).toEqual([
      'mismatch-early',
      'mismatch-late',
      'unplaced-mismatch',
      'no-evidence',
      'stale',
      'verified-early'
    ])
  })
})

describe('claim problem text', () => {
  const evidence = {
    run: 'lr-sweep/lr-3e-4',
    metric: 'acc',
    split: 'val',
    role: 'stated' as const,
    status: 'verified' as const,
    recordedValue: 0.85,
    currentValue: 0.85,
    formatted: '85.0',
    format: 'percent:1'
  }

  it('says which number changed or went missing from the paper', () => {
    const changed = {
      ...claim('a', 'mismatch', 4),
      evidence: [{ ...evidence, status: 'mismatch' as const, currentValue: 0.81 }]
    }
    expect(claimProblemText(changed)).toBe('lr-sweep/lr-3e-4 now gives 0.81, not 0.85.')
    const rewritten = {
      ...claim('b', 'mismatch', 4),
      evidence: [evidence],
      manuscript: { file: 'main.tex', values: [{ found: false, line: null }] }
    }
    expect(claimProblemText(rewritten)).toBe('The paper no longer states 85.0% here.')
    expect(claimProblemText({ ...claim('c', 'verified', 1), evidence: [evidence] })).toBeNull()
  })
})
