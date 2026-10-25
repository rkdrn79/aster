import { describe, expect, it } from 'vitest'
import {
  agreementText,
  isSmallSample,
  pairwiseCountsText,
  singleCountsText
} from './research-sample-rating-summary-text'

describe('sample rating summary text', () => {
  it('states counts with n, never a winner, and flags fewer than 10 judgments', () => {
    expect(pairwiseCountsText({ wins: 3, losses: 1, ties: 1, n: 5 })).toBe(
      '3 wins · 1 tie · 1 loss · n = 5'
    )
    expect(singleCountsText({ good: 0, bad: 0, unsure: 0, n: 0 })).toBe('No ratings yet')
    expect(isSmallSample({ n: 9 })).toBe(true)
    expect(isSmallSample({ n: 10 })).toBe(false)
    expect(isSmallSample({ n: 0 })).toBe(false)
  })

  it('reports agreement only over samples both raters judged', () => {
    expect(agreementText({ overlap: 4, agreeing: 3, rate: 0.75 })).toBe(
      '75% agree on 4 shared samples'
    )
    expect(agreementText({ overlap: 0, agreeing: 0, rate: null })).toBe(
      'No sample rated by both you and an agent yet'
    )
  })
})
