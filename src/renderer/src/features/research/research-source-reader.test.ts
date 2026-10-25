import { describe, expect, it } from 'vitest'
import { parseResearchMetrics, researchSourceIdentityMismatch } from './research-source-reader'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'

describe('research metric parsing', () => {
  it('keeps valid JSONL events when one row is malformed and the final line is incomplete', () => {
    const result = parseResearchMetrics(
      [
        '{"schemaVersion":1,"runId":"r","step":1,"metrics":{"loss":0,"accuracy":null}}',
        '{broken}',
        '{"schemaVersion":1,"runId":"r","step":2,"metrics":{"loss":0.5}}',
        '{"schemaVersion":1,"runId":"r","step":3,"metrics":{"loss":0.4}'
      ].join('\n'),
      'jsonl'
    )
    expect(result.events.map((event) => event.value)).toEqual([0, 0.5])
    expect(result.sourceRunId).toBe('r')
    expect(result.errorRows).toBe(1)
    expect(result.incompleteLastLine).toBe(true)
  })

  it('parses quoted CSV newlines and leaves blank metric cells missing', () => {
    const result = parseResearchMetrics('step,loss,note\n1,0,"first\nsecond"\n2,,"x"\n', 'csv')
    expect(result.events.filter((event) => event.metric === 'loss')).toEqual([
      { x: 1, metric: 'loss', split: 'unspecified', value: 0 }
    ])
    expect(result.metrics).toContain('loss')
    expect(result.metrics).not.toContain('note')
    expect(result.errorRows).toBe(0)
    expect(result.csvSelectedMetricColumns).toEqual(['loss'])
  })

  it('uses an explicit CSV x-axis and metric selection without treating note text as data', () => {
    const result = parseResearchMetrics('epoch,loss,note\n1,0,first\n2,0.5,second\n', 'csv', {
      xColumn: 'epoch',
      metricColumns: ['loss']
    })
    expect(result.xLabel).toBe('epoch')
    expect(result.events).toEqual([
      { x: 1, metric: 'loss', split: 'unspecified', value: 0 },
      { x: 2, metric: 'loss', split: 'unspecified', value: 0.5 }
    ])
    expect(result.errorRows).toBe(0)
  })

  it('rejects a saved CSV mapping if its x-axis column disappears', () => {
    expect(() =>
      parseResearchMetrics('step,loss\n1,0\n', 'csv', {
        xColumn: 'epoch',
        metricColumns: ['loss']
      })
    ).toThrow('x-axis column is missing')
  })

  it('refuses ambiguous duplicate CSV headers', () => {
    expect(() => parseResearchMetrics('loss,loss\n1,2\n', 'csv')).toThrow('unique')
  })

  it('includes a valid final JSONL record without a trailing newline', () => {
    const result = parseResearchMetrics(
      '{"schemaVersion":1,"runId":"r","metrics":{"loss":0}}',
      'jsonl'
    )
    expect(result.events.map((event) => event.value)).toEqual([0])
    expect(result.incompleteLastLine).toBe(false)
  })

  it('detects a different JSONL Run ID after attachment', () => {
    const run: ResearchRunRecord = {
      id: '00000000-0000-4000-8000-000000000002',
      experimentId: '00000000-0000-4000-8000-000000000001',
      name: 'Baseline',
      hostId: 'local',
      workspaceId: 'workspace',
      workspacePath: '/workspace',
      sourcePath: '/workspace/metrics.jsonl',
      format: 'jsonl',
      sourceRunId: 'baseline',
      logPath: null,
      configPath: null,
      execution: 'unknown',
      reportedBy: 'unavailable',
      observedAt: null,
      createdAt: '2026-10-22T10:00:00Z'
    }
    const other = parseResearchMetrics(
      '{"schemaVersion":1,"runId":"other","metrics":{"loss":0}}',
      'jsonl'
    )
    expect(researchSourceIdentityMismatch(run, other)).toContain('belongs to a different run')
    expect(researchSourceIdentityMismatch({ ...run, sourceRunId: undefined }, other)).toBeNull()
  })
})
