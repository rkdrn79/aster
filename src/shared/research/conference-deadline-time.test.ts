import { describe, expect, it } from 'vitest'
import { parseDeadlineZone, resolveDeadlineInstant } from './conference-deadline-time'

function utc(wallClock: string, timezone?: string): string | null {
  const instant = resolveDeadlineInstant(wallClock, timezone)
  return instant ? new Date(instant.epochMs).toISOString() : null
}

describe('resolveDeadlineInstant', () => {
  it('reads AoE as UTC-12, so the deadline lands the next day in UTC', () => {
    expect(utc('2026-01-28 23:59:59', 'AoE')).toBe('2026-01-29T11:59:59.000Z')
  })

  it.each([
    ['UTC', '2026-11-13T23:59:00.000Z'],
    ['UTC+0', '2026-11-13T23:59:00.000Z'],
    ['UTC-7', '2026-11-14T06:59:00.000Z'],
    ['UTC-08', '2026-11-14T07:59:00.000Z'],
    ['GMT+02', '2026-11-13T21:59:00.000Z'],
    ['UTC+05:30', '2026-11-13T18:29:00.000Z'],
    ['PST', '2026-11-14T07:59:00.000Z'],
    ['KST', '2026-11-13T14:59:00.000Z']
  ])('converts fixed zone %s', (zone, expected) => {
    expect(utc('2026-11-13 23:59', zone)).toBe(expected)
  })

  it('follows daylight saving for named regions', () => {
    expect(utc('2026-07-01 23:59', 'Europe/London')).toBe('2026-07-01T22:59:00.000Z')
    expect(utc('2026-12-01 23:59', 'Europe/London')).toBe('2026-12-01T23:59:00.000Z')
    expect(utc('2026-07-01 23:59', 'PT')).toBe('2026-07-02T06:59:00.000Z')
    expect(utc('2026-12-01 23:59', 'PT')).toBe('2026-12-02T07:59:00.000Z')
  })

  it('treats a date without a time as the end of that day', () => {
    expect(utc('2026-05-15', 'UTC')).toBe('2026-05-15T23:59:59.000Z')
  })

  it('falls back to AoE and flags a missing or unknown zone', () => {
    expect(resolveDeadlineInstant('2026-01-28 23:59', 'CST')).toEqual({
      epochMs: Date.parse('2026-01-29T11:59:00Z'),
      zoneRecognized: false
    })
    expect(resolveDeadlineInstant('2026-01-28 23:59', undefined)?.zoneRecognized).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(resolveDeadlineInstant('2026-02-30 12:00', 'UTC')).toBeNull()
    expect(resolveDeadlineInstant('TBA', 'UTC')).toBeNull()
  })
})

describe('parseDeadlineZone', () => {
  it('rejects offsets beyond real time zones', () => {
    expect(parseDeadlineZone('UTC+15')).toBeNull()
    expect(parseDeadlineZone('Mars/Olympus')).toBeNull()
  })
})
