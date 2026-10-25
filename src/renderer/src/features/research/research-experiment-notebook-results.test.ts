import { describe, expect, it } from 'vitest'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { configSeedKey, notebookResultRows } from './research-experiment-notebook-results'
import { runRecord, summaryRecord } from './research-experiment-notebook.test-fixture'

describe('Notebook results', () => {
  it('keys a config apart from its seeds, as the harness seed check does', () => {
    const seed1 = configSeedKey('{"lr":0.001,"seed":1,"model":{"depth":4,"init.seed":7}}')
    const seed2 = configSeedKey('{"model":{"init.seed":9,"depth":4},"seed":2,"lr":0.001}')
    expect(seed1).toBe(seed2)
    expect(configSeedKey('{"lr":0.003,"seed":1,"model":{"depth":4}}')).not.toBe(seed1)
    expect(configSeedKey('not json')).toBeNull()
    expect(configSeedKey('[1,2]')).toBeNull()
  })

  it('shares a row across seeds with the mean, spread, and mean difference from the baseline', () => {
    const runs = [
      runRecord('base', 'succeeded', { createdAt: '2026-10-24T01:00:00Z' }),
      runRecord('cand seed 1', 'succeeded', { createdAt: '2026-10-24T02:00:00Z' }),
      runRecord('cand seed 2', 'succeeded', { createdAt: '2026-10-24T03:00:00Z' }),
      runRecord('cand seed 3', 'failed', { createdAt: '2026-10-24T04:00:00Z' })
    ]
    const summaries = new Map([
      ['base', summaryRecord('exp/base', { last: 0.8 })],
      [
        'cand seed 1',
        summaryRecord('exp/cand-1', { last: 0.82 }, { run: 'exp/base', delta: 0.02 })
      ],
      ['cand seed 2', summaryRecord('exp/cand-2', { last: 0.84 }, { run: 'exp/base', delta: 0.04 })]
    ])
    const configKeys = new Map([
      ['base', 'base-config'],
      ['cand seed 1', 'cand-config'],
      ['cand seed 2', 'cand-config'],
      ['cand seed 3', 'cand-config']
    ])
    const { rows, grouped } = notebookResultRows({
      runs,
      statusOf: (run: ResearchRunRecord) => ({ state: run.execution }),
      summaryOf: (run) => summaries.get(run.id) ?? null,
      configKeyOf: (run) => configKeys.get(run.id) ?? null,
      baselineRunId: 'base',
      baselineReference: 'exp/base',
      mode: 'last'
    })
    expect(grouped).toBe(true)
    expect(rows.map((row) => [row.name, row.seeds])).toEqual([
      ['cand seed 3', 1],
      ['cand', 2],
      ['base', 1]
    ])
    const cand = rows[1]
    expect(cand?.lead.id).toBe('cand seed 2')
    expect(cand?.value).toBeCloseTo(0.83)
    expect(cand?.spread).toBeCloseTo(Math.SQRT2 * 0.01)
    expect(cand?.delta).toBeCloseTo(0.03)
    expect(rows[2]?.isBaseline).toBe(true)
  })
})
