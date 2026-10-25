import { describe, expect, it } from 'vitest'
import { blindSwapsSides, choiceForVerdict, verdictForChoice } from './research-sample-rating-blind'

describe('blind A/B sides', () => {
  it('records the Run that was shown on the chosen side', () => {
    expect(verdictForChoice('left', false)).toBe('a')
    expect(verdictForChoice('left', true)).toBe('b')
    expect(verdictForChoice('right', true)).toBe('a')
    expect(verdictForChoice('tie', true)).toBe('tie')
    for (const swapped of [false, true]) {
      for (const choice of ['left', 'right', 'tie'] as const) {
        expect(choiceForVerdict(verdictForChoice(choice, swapped), swapped)).toBe(choice)
      }
    }
  })

  it('keeps each sample on fixed sides without a pattern across sequential IDs', () => {
    const pair = 'main/base\u0000main/lora'
    const sides = Array.from({ length: 200 }, (_, index) => blindSwapsSides(pair, `s-${index}`))
    const swapped = sides.filter(Boolean).length
    expect(swapped).toBeGreaterThan(70)
    expect(swapped).toBeLessThan(130)
    const alternations = sides.slice(1).filter((side, index) => side !== sides[index]).length
    expect(alternations).toBeLessThan(150)
    expect(blindSwapsSides(pair, 's-7')).toBe(sides[7])
  })
})
