import { describe, expect, it } from 'vitest'
import type { WritingSkeleton } from '../../../../shared/research/research-writing-results'
import {
  confirmDisabledReason,
  editedLines,
  skeletonFields,
  skeletonTitle,
  skeletonToShow
} from './research-writing-skeleton-card'

function skeleton(overrides: Partial<WritingSkeleton> = {}): WritingSkeleton {
  return {
    section: 'intro',
    path: '.aster/writing/intro.skeleton.md',
    status: 'draft',
    lines: [
      { key: 'GAP', text: 'Plain nets train worse when deeper (Fig. 1).', required: true },
      {
        key: 'WHY-NOT',
        text: 'Normalization fixed gradients; the solver is the problem.',
        required: true
      },
      {
        key: 'INSIGHT',
        text: 'Fitting a residual is easier than fitting the mapping.',
        required: true
      },
      { key: 'APPROACH', text: 'Identity shortcuts around stacked layers.', required: true },
      { key: 'EVIDENCE', text: '', required: true },
      { key: 'TERM', text: 'degradation problem', required: false }
    ],
    missing: ['EVIDENCE'],
    notes: '',
    updatedAt: '2026-11-17T01:00:00.000Z',
    updatedBy: 'agent',
    confirmedAt: null,
    confirmedBy: null,
    ...overrides
  }
}

describe('skeleton card', () => {
  it('lists the five required lines in order, then the optional ones', () => {
    expect(
      skeletonFields(skeleton()).map((field) => [field.key, field.label, field.required])
    ).toEqual([
      ['GAP', 'Gap', true],
      ['WHY-NOT', 'Why not', true],
      ['INSIGHT', 'Insight', true],
      ['APPROACH', 'Approach', true],
      ['EVIDENCE', 'Evidence', true],
      ['TERM', 'Term', false]
    ])
    // A skeleton file that lost a required line still shows a field for it.
    expect(skeletonFields(skeleton({ lines: [] })).map((field) => field.key)).toHaveLength(5)
  })

  it('reports only real edits, as the full set of lines to save', () => {
    expect(editedLines(skeleton(), { GAP: 'Plain nets train worse when deeper (Fig. 1). ' })).toBe(
      null
    )
    const edited = editedLines(skeleton(), { EVIDENCE: '3.57% top-5 error (claim c1)' })
    expect(edited?.EVIDENCE).toBe('3.57% top-5 error (claim c1)')
    expect(edited?.GAP).toBe('Plain nets train worse when deeper (Fig. 1).')
  })

  it('names the empty required lines that block confirmation', () => {
    expect(confirmDisabledReason(skeleton(), {})).toBe('Fill in Evidence first.')
    expect(confirmDisabledReason(skeleton(), { GAP: ' ' })).toBe('Fill in Gap and Evidence first.')
    expect(confirmDisabledReason(skeleton(), { EVIDENCE: '3.57% top-5 (claim c1)' })).toBe(null)
  })

  it('shows the newest draft, else the skeleton the person just confirmed', () => {
    const older = skeleton({ section: 'method', path: 'm', updatedAt: '2026-11-17T00:00:00.000Z' })
    const newer = skeleton({ path: 'i' })
    const confirmed = skeleton({ section: 'abstract', path: 'a', status: 'confirmed' })
    expect(skeletonToShow([older, newer, confirmed], null)?.path).toBe('i')
    expect(skeletonToShow([confirmed], null)).toBe(null)
    expect(skeletonToShow([confirmed], 'a')?.path).toBe('a')
    expect(skeletonToShow([skeleton({ status: 'missing' })], null)).toBe(null)
  })

  it('titles the card by the section name', () => {
    expect(skeletonTitle({ section: 'intro' })).toBe('Introduction skeleton')
    expect(skeletonTitle({ section: 'related' })).toBe('Related work skeleton')
  })
})
