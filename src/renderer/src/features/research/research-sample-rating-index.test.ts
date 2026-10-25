import { describe, expect, it } from 'vitest'
import type { ResearchSampleRating } from '../../../../shared/research/research-sample-ratings'
import {
  indexSampleRatings,
  sampleJudgments,
  sampleMatchesFilter
} from './research-sample-rating-index'

function rating(overrides: Partial<ResearchSampleRating>): ResearchSampleRating {
  return {
    id: 'rating-1',
    at: '2026-10-24T00:00:00Z',
    sampleId: 's-1',
    mode: 'pairwise',
    run: 'main/a',
    against: 'main/b',
    verdict: 'a',
    tags: [],
    note: null,
    by: 'user',
    blind: false,
    rubric: null,
    judge: null,
    ...overrides
  }
}

describe('sample rating index', () => {
  it('reads judgments stored from either side of the pair from the scope’s side', () => {
    const index = indexSampleRatings([
      rating({ run: 'main/b', against: 'main/a', verdict: 'a' }),
      rating({ id: 'rating-2', by: 'agent', verdict: 'a' })
    ])
    const judgments = sampleJudgments(index, 's-1', 'main/a', 'main/b')
    expect(judgments.user?.verdict).toBe('b')
    expect(judgments.agent?.verdict).toBe('a')
    const pair = { mode: 'pairwise', run: 'main/a', against: 'main/b' } as const
    expect(sampleMatchesFilter('disagreements', 's-1', pair, index, () => true)).toBe(true)
    expect(sampleMatchesFilter('unrated', 's-1', pair, index, () => true)).toBe(false)
    expect(sampleMatchesFilter('unrated', 's-2', pair, index, () => true)).toBe(true)
  })

  it('filters single ratings by Runs that have the sample and by any bad verdict', () => {
    const index = indexSampleRatings([
      rating({ mode: 'single', against: null, verdict: 'good' }),
      rating({
        id: 'rating-2',
        mode: 'single',
        run: 'main/b',
        against: null,
        verdict: 'bad',
        by: 'agent'
      })
    ])
    const scope = { mode: 'single', runs: ['main/a', 'main/b'] } as const
    const onlyA = (run: string): boolean => run === 'main/a'
    expect(sampleMatchesFilter('unrated', 's-1', scope, index, onlyA)).toBe(false)
    expect(sampleMatchesFilter('unrated', 's-1', scope, index, () => true)).toBe(true)
    expect(sampleMatchesFilter('bad', 's-1', scope, index, () => true)).toBe(true)
  })
})
