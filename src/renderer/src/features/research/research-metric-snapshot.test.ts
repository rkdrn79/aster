import { describe, expect, it } from 'vitest'
import { metricSnapshotFromObservation } from './research-metric-snapshot'
import type { RunObservation } from './research-source-reader'

describe('mobile metric snapshot', () => {
  it('keeps a real zero and marks an incomplete preview as partial', () => {
    const observation: RunObservation = {
      events: [
        { x: 1, metric: 'loss', split: 'train', value: 1.2 },
        { x: 2, metric: 'loss', split: 'train', value: 0 }
      ],
      metrics: ['loss'],
      xLabel: 'step',
      errorRows: 0,
      incompleteLastLine: true,
      observedAt: '2026-10-23T00:00:00.000Z',
      sourceSize: 200,
      sourceRunId: 'run-a',
      sourceAnchor: null,
      csvColumns: null,
      csvSelectedXColumn: null,
      csvSelectedMetricColumns: []
    }

    expect(metricSnapshotFromObservation(observation)).toEqual({
      capturedAt: '2026-10-23T00:00:00.000Z',
      partial: true,
      metrics: [{ name: 'loss', split: 'train', value: 0 }]
    })
  })
})
