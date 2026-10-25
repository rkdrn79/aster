import { describe, expect, it } from 'vitest'
import {
  emaSmooth,
  formatTick,
  logTicks,
  nearestIndex,
  niceTicks,
  valueAtX
} from './research-metric-chart'

describe('metric chart scales', () => {
  it('picks round linear ticks that cover the data', () => {
    expect(niceTicks(0.0122, 0.0749, 5)).toEqual([0, 0.02, 0.04, 0.06, 0.08])
    expect(niceTicks(25, 300, 4)).toEqual([0, 100, 200, 300])
    expect(niceTicks(0.1, 0.3, 2)).toEqual([0.1, 0.2, 0.3])
    expect(niceTicks(5, 5, 4)).toEqual([4.5, 5, 5.5])
  })

  it('fills narrow log spans with 2× and 5× ticks and wide ones with decades only', () => {
    expect(logTicks(0.012, 0.075)).toEqual([0.01, 0.02, 0.05, 0.1])
    expect(logTicks(1e-4, 10)).toEqual([1e-4, 1e-3, 0.01, 0.1, 1, 10])
    expect(logTicks(0, 1)).toEqual([])
  })

  it('labels ticks at the precision of their spacing', () => {
    expect(formatTick(0.05, 0.01)).toBe('0.05')
    expect(formatTick(200, 100)).toBe('200')
    expect(formatTick(25_000, 5_000)).toBe('25k')
    expect(formatTick(2e-4, 1e-4)).toBe('2e-4')
    expect(formatTick(0, 0.5)).toBe('0')
  })
})

describe('metric chart smoothing and lookup', () => {
  it('debiases the moving average so it starts at the first value', () => {
    const points = [10, 0, 10, 0].map((value, x) => ({ x, value }))
    const smoothed = emaSmooth(points, 0.5).map((point) => Number(point.value.toFixed(3)))
    expect(smoothed).toEqual([10, 3.333, 7.143, 3.333])
    expect(emaSmooth(points, 0)).toBe(points)
  })

  it('finds the nearest step and reads a reset run from its latest segment', () => {
    expect(nearestIndex([0, 10, 20], 14)).toBe(1)
    expect(nearestIndex([0, 10, 20], 16)).toBe(2)
    expect(nearestIndex([], 1)).toBe(-1)
    const segments = [
      [
        { x: 1, value: 0.9 },
        { x: 3, value: 0.7 }
      ],
      [
        { x: 2, value: 0.5 },
        { x: 4, value: 0.4 }
      ]
    ]
    expect(valueAtX(segments, 2)?.value).toBe(0.5)
    expect(valueAtX(segments, 1)?.value).toBe(0.9)
    expect(valueAtX(segments, 9)).toBeNull()
  })
})
