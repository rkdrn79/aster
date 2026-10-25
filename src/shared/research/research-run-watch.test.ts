import { describe, expect, it } from 'vitest'
import { parseResearchMetricLines } from './research-run-metrics'
import type { ResearchWatchEvent } from './research-run-watch'
import {
  formatResearchWatchCondition,
  parseResearchWatchConditions
} from './research-run-watch-conditions'
import {
  evaluateResearchWatch,
  type ResearchWatchFiring,
  type ResearchWatchObservation
} from './research-run-watch-evaluation'

const T0 = '2026-10-24T00:00:00.000Z'
const at = (minutes: number): string => new Date(Date.parse(T0) + minutes * 60_000).toISOString()

function observe(overrides: Partial<ResearchWatchObservation> = {}): ResearchWatchObservation {
  return {
    now: at(1),
    execution: { state: 'running', source: 'aster-harness', exitCode: null },
    job: null,
    newMetricRows: [],
    newLogLines: [],
    progressed: false,
    ...overrides
  }
}

function watchOn(...on: string[]): {
  conditions: string[]
  fired: ResearchWatchEvent[]
  lastProgressAt: string
} {
  return {
    conditions: parseResearchWatchConditions(on).map(formatResearchWatchCondition),
    fired: [],
    lastProgressAt: T0
  }
}

function asEvent(firing: ResearchWatchFiring): ResearchWatchEvent {
  return {
    ...firing,
    firedAt: T0,
    runState: { execution: null, executionSource: null, job: null, jobReason: null },
    lastMetrics: null,
    notifiedAt: null,
    delivery: {
      state: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      deliveredAt: null,
      detail: null
    }
  }
}

describe('research watch conditions', () => {
  it('splits comma lists, keeps commas inside log patterns, and dedupes', () => {
    expect(
      parseResearchWatchConditions([
        'failed, nan,stall:30',
        'metric:val_loss<=0.3,log:OOM|a,b'
      ]).map(formatResearchWatchCondition)
    ).toEqual(['failed', 'nan', 'stall:30', 'metric:val_loss<=0.3', 'log:OOM|a,b'])
    expect(parseResearchWatchConditions(['exit', 'exit,EXIT'])).toHaveLength(1)
  })

  it('rejects unknown conditions and invalid patterns before a watch exists', () => {
    expect(() => parseResearchWatchConditions(['finished'])).toThrow(/Unknown watch condition/)
    expect(() => parseResearchWatchConditions(['metric:loss=1'])).toThrow()
    expect(() => parseResearchWatchConditions(['stall:0'])).toThrow(/whole minutes/)
    expect(() => parseResearchWatchConditions(['log:(unclosed'])).toThrow(/regular expression/)
  })
})

describe('research watch evaluation', () => {
  it('fires a metric threshold on the first row that crosses it, once', () => {
    const watch = watchOn('metric:val_loss<0.3')
    const rows = parseResearchMetricLines(
      [
        '{"runId":"r","step":100,"split":"val","metrics":{"val_loss":0.41}}',
        '{"runId":"r","step":200,"split":"val","metrics":{"val_loss":0.29}}',
        '{"runId":"r","step":300,"split":"val","metrics":{"val_loss":0.21}}'
      ].join('\n')
    ).rows
    const first = evaluateResearchWatch(watch, observe({ newMetricRows: rows }))
    expect(first.firings).toEqual([
      {
        condition: 'metric:val_loss<0.3',
        implicit: false,
        evidence: 'val_loss=0.29 at step 200 (val)'
      }
    ])
    const again = evaluateResearchWatch(
      { ...watch, fired: first.firings.map(asEvent) },
      observe({ newMetricRows: rows })
    )
    expect(again.firings).toEqual([])
  })

  it('catches NaN and Infinity written by Python json.dumps', () => {
    const { rows, malformed } = parseResearchMetricLines(
      '{"step":5,"metrics":{"loss":NaN,"grad_norm":Infinity}}\n{"step":6,"metrics":{"loss":"nan"}}\n'
    )
    expect(malformed).toBe(0)
    const result = evaluateResearchWatch(watchOn('nan'), observe({ newMetricRows: rows }))
    expect(result.firings[0]?.evidence).toBe('loss, grad_norm not finite at step 5')
  })

  it('matches log lines appended since the last check', () => {
    const result = evaluateResearchWatch(
      watchOn('log:OOM|Traceback'),
      observe({ newLogLines: ['epoch 3 ok', 'torch.cuda.OutOfMemoryError: CUDA OOM on device 0'] })
    )
    expect(result.firings[0]?.evidence).toContain('CUDA OOM')
  })

  it('counts a stall only while the job runs, and resets on progress', () => {
    const watch = watchOn('stall:30')
    const queued = evaluateResearchWatch(
      watch,
      observe({ now: at(45), job: { state: 'pending', reason: 'Priority', exitCode: null } })
    )
    expect(queued.firings).toEqual([])
    expect(queued.lastProgressAt).toBe(at(45))

    const quiet = evaluateResearchWatch(
      { ...watch, lastProgressAt: at(45) },
      observe({ now: at(80), job: { state: 'running', reason: null, exitCode: null } })
    )
    expect(quiet.firings[0]).toMatchObject({
      condition: 'stall:30',
      evidence: 'no new metrics or log output for 35 min'
    })

    const progressing = evaluateResearchWatch(
      { ...watch, lastProgressAt: at(45) },
      observe({ now: at(80), progressed: true })
    )
    expect(progressing.firings).toEqual([])
    expect(progressing.lastProgressAt).toBe(at(80))
  })

  it('reads terminal states from run.json first and the SLURM job second', () => {
    const watch = watchOn('failed', 'succeeded')
    const oom = evaluateResearchWatch(
      watch,
      observe({
        execution: { state: 'running', source: 'aster-harness', exitCode: null },
        job: { state: 'out_of_memory', reason: 'ran out of memory', exitCode: 0 }
      })
    )
    expect(oom.ended).toBe(true)
    expect(oom.firings).toEqual([
      {
        condition: 'failed',
        implicit: false,
        evidence: 'SLURM job out_of_memory (ran out of memory), exit 0'
      }
    ])
    const succeeded = evaluateResearchWatch(
      watch,
      observe({ execution: { state: 'succeeded', source: 'aster-harness', exitCode: 0 } })
    )
    expect(succeeded.firings.map((firing) => firing.condition)).toEqual(['succeeded'])
  })

  it('reports the end of a Run to a watch that only asked about metrics', () => {
    const result = evaluateResearchWatch(
      watchOn('metric:acc>0.9'),
      observe({ execution: { state: 'failed', source: 'aster-slurm', exitCode: 1 } })
    )
    expect(result.firings).toEqual([
      {
        condition: 'exit',
        implicit: true,
        evidence: 'Run execution failed (exit 1) per aster-slurm'
      }
    ])
  })
})
