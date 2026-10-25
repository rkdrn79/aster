import { describe, expect, it } from 'vitest'
import {
  compareRecordedConditions,
  launchCodeEvidence,
  manifestSourceMismatch,
  parseResearchRunManifest
} from './research-run-manifest'

function manifest(unit: string, revision: string | null) {
  return parseResearchRunManifest(
    JSON.stringify({
      schemaVersion: 1,
      code: { commit: 'a'.repeat(40), dirty: false, capturePhase: 'at_attach' },
      metrics: { definitions: { loss: { unit, aggregation: 'last', direction: 'minimize' } } },
      evaluation: {
        datasetId: 'validation',
        datasetRevision: revision,
        split: 'validation',
        evaluatorRevision: 'e1'
      }
    })
  )
}

describe('run manifest evidence', () => {
  it('keeps missing comparison fields unknown and explicit mismatches different', () => {
    expect(
      compareRecordedConditions([manifest('scalar', null), manifest('scalar', null)], 'loss')
    ).toEqual({
      condition: 'unknown',
      reasons: ['dataset version']
    })
    expect(
      compareRecordedConditions([manifest('scalar', 'd1'), manifest('fraction', 'd1')], 'loss')
    ).toEqual({ condition: 'different', reasons: ['metric unit'] })
    expect(
      compareRecordedConditions([manifest('scalar', 'd1'), manifest('scalar', 'd1')], 'loss')
    ).toEqual({ condition: 'recorded-match', reasons: [] })
  })

  it('does not present an attach-time commit as launch code', () => {
    expect(launchCodeEvidence(manifest('scalar', 'd1'))).toBe('unknown')
    const launch = parseResearchRunManifest(
      JSON.stringify({
        schemaVersion: 1,
        code: { commit: 'b'.repeat(40), dirty: true, capturePhase: 'at_launch' }
      })
    )
    expect(launchCodeEvidence(launch)).toBe('bbbbbbb + uncommitted changes (not saved)')
  })

  it('rejects malformed or unsupported manifest versions', () => {
    expect(() => parseResearchRunManifest('{"schemaVersion":2}')).toThrow()
    expect(() =>
      parseResearchRunManifest(
        '{"schemaVersion":1,"execution":{"state":"succeeded","reportedBy":"runtime","observedAt":"2026-10-22T10:00:00Z"}}'
      )
    ).toThrow()
  })

  it('refuses a manifest for a different JSONL Run ID', () => {
    const selected = parseResearchRunManifest('{"schemaVersion":1,"externalRunId":"selected"}')
    expect(manifestSourceMismatch(selected, 'other')).toContain('metrics file is from run other')
    expect(manifestSourceMismatch(selected, 'selected')).toBeNull()
    expect(manifestSourceMismatch(selected, null)).toBeNull()
  })
})
