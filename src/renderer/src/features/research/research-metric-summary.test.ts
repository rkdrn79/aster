import { describe, expect, it } from 'vitest'
import { observedMetricValue } from './research-metric-summary'

describe('observed metric summary', () => {
  const events = [
    { x: 1, metric: 'loss', split: 'train', value: 0 },
    { x: 2, metric: 'loss', split: 'train', value: 0.5 },
    { x: 3, metric: 'loss', split: 'train', value: 0.3 }
  ]

  it('keeps actual zero, last and best distinct', () => {
    expect(observedMetricValue(events, 'last', 'minimize')).toBe(0.3)
    expect(observedMetricValue(events, 'best', 'minimize')).toBe(0)
    expect(observedMetricValue(events, 'best', 'maximize')).toBe(0.5)
  })

  it('does not guess a best direction or replace missing with zero', () => {
    expect(observedMetricValue(events, 'best', null)).toBeNull()
    expect(observedMetricValue([], 'last', 'maximize')).toBeNull()
  })
})
