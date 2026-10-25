import { describe, expect, it } from 'vitest'
import {
  effectiveRunStatusFacts,
  formatRunDuration,
  researchRunStatusSummary,
  runStatusFactsFromManifest
} from './research-run-status-label'

const NOW = Date.parse('2026-10-24T12:00:00.000Z')

describe('run status summary', () => {
  it('formats durations at the precision a researcher reads them', () => {
    expect(formatRunDuration(45_000)).toBe('45s')
    expect(formatRunDuration(200_000)).toBe('3m 20s')
    expect(formatRunDuration(200_000, true)).toBe('3m')
    expect(formatRunDuration(180_000)).toBe('3m')
    expect(formatRunDuration(2 * 3_600_000 + 5 * 60_000 + 9_000)).toBe('2h 5m')
    expect(formatRunDuration(26 * 3_600_000)).toBe('1d 2h')
    expect(formatRunDuration(-5)).toBe('0s')
  })

  it('counts a running Run from its start and flags a launcher that died', () => {
    const startedAt = new Date(NOW - 12 * 60_000 - 30_000).toISOString()
    expect(researchRunStatusSummary({ state: 'running', startedAt }, NOW)).toEqual({
      label: 'Running · 12m',
      tone: 'running'
    })
    expect(researchRunStatusSummary({ state: 'running', startedAt: null }, NOW).label).toBe(
      'Running'
    )
    expect(
      researchRunStatusSummary({ state: 'running', startedAt, liveness: 'exited' }, NOW)
    ).toEqual({ label: 'Running · launcher exited', tone: 'stalled' })
  })

  it('names how a finished Run ended', () => {
    expect(researchRunStatusSummary({ state: 'succeeded', durationMs: 200_000 }, NOW).label).toBe(
      'Succeeded · 3m 20s'
    )
    expect(researchRunStatusSummary({ state: 'failed', exitCode: 1 }, NOW).label).toBe(
      'Failed · exit 1'
    )
    expect(
      researchRunStatusSummary({ state: 'failed', exitCode: null, signal: 'SIGKILL' }, NOW).label
    ).toBe('Failed · SIGKILL')
    expect(researchRunStatusSummary({ state: 'cancelled', exitCode: 143 }, NOW).label).toBe(
      'Cancelled'
    )
    expect(researchRunStatusSummary({ state: 'unknown' }, NOW).label).toBe('Status unknown')
  })

  it('derives a duration from launch times when run.json has none', () => {
    const facts = runStatusFactsFromManifest({
      schemaVersion: 1,
      execution: {
        state: 'succeeded',
        reportedBy: 'manifest',
        observedAt: '2026-10-24T11:00:00.000Z',
        exitCode: 0
      },
      launch: { startedAt: '2026-10-24T10:00:00.000Z', finishedAt: '2026-10-24T10:01:30.000Z' }
    })
    expect(facts).toMatchObject({ state: 'succeeded', exitCode: 0, durationMs: 90_000 })
  })

  it('keeps a status the researcher set by hand over the live one', () => {
    const live = { state: 'running' as const }
    expect(effectiveRunStatusFacts({ execution: 'failed', reportedBy: 'user' }, live)).toEqual({
      state: 'failed'
    })
    expect(effectiveRunStatusFacts({ execution: 'unknown', reportedBy: 'manifest' }, live)).toBe(
      live
    )
  })
})
