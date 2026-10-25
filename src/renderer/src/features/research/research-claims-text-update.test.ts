import { describe, expect, it } from 'vitest'
import type { ResearchClaimAudit } from '../../../../shared/research/research-harness-results'
import {
  applyClaimTextUpdate,
  claimTextUpdate,
  replaceClaimNumber
} from './research-claims-text-update'

function mismatch(format: string | null, recordedValue = 0.829, currentValue = 0.8413) {
  const claim: ResearchClaimAudit = {
    id: 'rank16-accuracy',
    text: 'Rank 16 reaches 82.9% validation accuracy.',
    status: 'mismatch',
    reasons: [],
    evidence: [
      {
        run: 'lora-r16/seed-42',
        metric: 'acc',
        split: 'val',
        role: 'stated',
        status: 'mismatch',
        recordedValue,
        currentValue,
        formatted: null,
        format
      }
    ],
    manuscript: null,
    location: { file: 'paper/main.tex', line: 2 }
  }
  return claim
}

describe('Updating a claim to its Run value', () => {
  it('labels the new number the way the claim format prints it', () => {
    expect(claimTextUpdate(mismatch('percent:1'))).toMatchObject({
      file: 'paper/main.tex',
      line: 2,
      label: '84.1%'
    })
    expect(claimTextUpdate(mismatch('fixed:3'))?.label).toBe('0.841')
    expect(claimTextUpdate({ ...mismatch('percent:1'), status: 'stale' })).toBeNull()
  })

  it('rewrites the one number on the line that states the recorded value', () => {
    const line = 'With rank~16 the adapter reaches 82.9\\% validation accuracy. % was 80.0'
    expect(replaceClaimNumber(line, 0.829, 0.8413, 'percent:1')).toBe(
      'With rank~16 the adapter reaches 84.1\\% validation accuracy. % was 80.0'
    )
    // Unformatted claims keep the decimals and scale the paper used.
    expect(replaceClaimNumber('accuracy of 0.83 on val', 0.829, 0.8413, null)).toBe(
      'accuracy of 0.84 on val'
    )
    expect(replaceClaimNumber('rank~16 reaches 82.9\\%', 0.829, 0.8413, null)).toBe(
      'rank~16 reaches 84.1\\%'
    )
  })

  it('takes the Run value into a line whose number was edited away from the claim', () => {
    expect(
      replaceClaimNumber(
        'Rank~64 raises it to 86.4\\% on the same split.',
        0.858,
        0.858,
        'percent:1'
      )
    ).toBe('Rank~64 raises it to 85.8\\% on the same split.')
    const edited = {
      ...mismatch('percent:1', 0.858, 0.858),
      manuscript: { file: 'paper/main.tex', values: [{ found: false, line: null }] }
    }
    expect(claimTextUpdate(edited)?.label).toBe('85.8%')
  })

  it('refuses an ambiguous line', () => {
    expect(replaceClaimNumber('82.9 & 82.9 \\\\', 0.829, 0.8413, 'percent:1')).toBeNull()
    expect(replaceClaimNumber('from 80.0\\% to 86.4\\%', 0.858, 0.858, 'percent:1')).toBeNull()
  })

  it('edits only the cited line of the file', () => {
    const content = 'Intro 82.9\\%.\nRank 16 reaches 82.9\\% accuracy.\n'
    const update = claimTextUpdate(mismatch('percent:1'))
    expect(update && applyClaimTextUpdate(content, update)).toBe(
      'Intro 82.9\\%.\nRank 16 reaches 84.1\\% accuracy.\n'
    )
  })
})
