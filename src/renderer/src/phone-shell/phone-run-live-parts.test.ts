import { describe, expect, it } from 'vitest'
import type { ResearchRunMediaItem } from '../../../shared/research/research-run-media'
import { sparklinePositions } from './PhoneMetricSparkline'
import { readableLogLines } from './PhoneRunLog'
import { newestMediaFirst } from './PhoneRunMedia'

describe('run log on the phone', () => {
  it('hides the harness’s metric and media records unless asked, and counts them', () => {
    const text =
      'step 1 loss=2\nASTER_METRIC {"step":1}\n  ASTER_MEDIA {"path":"a.png"}\nstep 2 loss=1\n'
    expect(readableLogLines(text, false)).toEqual({
      lines: ['step 1 loss=2', 'step 2 loss=1'],
      records: 2
    })
    expect(readableLogLines(text, true).lines).toHaveLength(4)
    expect(readableLogLines('', false)).toEqual({ lines: [], records: 0 })
  })
})

describe('metric sparkline', () => {
  it('spaces points by their steps, so skipped logging steps keep their gap', () => {
    const positions = sparklinePositions([
      { step: 0, value: 4 },
      { step: 10, value: 2 },
      { step: 100, value: 0 }
    ])
    expect(positions.map((point) => point.x)).toEqual([0, 0.1, 1])
    expect(positions.map((point) => point.y)).toEqual([0, 0.5, 1])
  })

  it('draws a flat line through the middle when every value is the same', () => {
    expect(
      sparklinePositions([
        { step: null, value: 3 },
        { step: null, value: 3 }
      ])
    ).toEqual([
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 }
    ])
  })
})

describe('run media on the phone', () => {
  it('shows the newest step first, and later records first within a step', () => {
    const item = (path: string, step: number | null): ResearchRunMediaItem => ({
      kind: 'image',
      path,
      step,
      label: null,
      sampleId: null,
      bytes: null,
      source: 'exec'
    })
    expect(
      newestMediaFirst([item('a', 1), item('b', 9), item('c', null), item('d', 9)]).map(
        (entry) => entry.path
      )
    ).toEqual(['d', 'b', 'a', 'c'])
  })
})
