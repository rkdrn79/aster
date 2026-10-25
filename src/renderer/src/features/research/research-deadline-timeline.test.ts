import { describe, expect, it } from 'vitest'
import type {
  ConferenceCatalog,
  ConferenceEdition,
  ConferenceTracking
} from '../../../../shared/research/conference-deadlines'
import { buildDeadlineEntries, splitSchedule } from './research-deadline-timeline'

function edition(series: string, year: number, dates: [string, string][]): ConferenceEdition {
  return {
    id: `${series}-${year}`,
    series,
    title: series.toUpperCase(),
    year,
    tags: [],
    topic: 'cv',
    rank: {},
    deadlines: dates.map(([type, date]) => ({
      type,
      label: type,
      stage: type === 'paper' ? 'submission' : type === 'rebuttal' ? 'rebuttal' : 'notification',
      date,
      timezone: 'UTC',
      source: 'huggingface'
    }))
  }
}

const catalog: ConferenceCatalog = {
  fetchedAt: '2026-10-24T00:00:00Z',
  sources: [],
  editions: [
    edition('cvpr', 2027, [
      ['paper', '2026-11-13'],
      ['rebuttal', '2027-01-27'],
      ['notification', '2027-02-26']
    ]),
    edition('cvpr', 2026, [
      ['paper', '2025-11-13'],
      ['rebuttal', '2026-01-27'],
      ['notification', '2026-02-26']
    ]),
    edition('eccv', 2026, [
      ['paper', '2026-03-05'],
      ['notification', '2026-06-17']
    ])
  ]
}

const tracking: ConferenceTracking = {
  schemaVersion: 1,
  trackedSeries: ['cvpr', 'eccv'],
  customDeadlines: [],
  submissions: [{ editionId: 'cvpr-2027', status: 'submitted', updatedAt: '2026-11-01' }],
  displayTimeZone: null
}

const keys = (entries: { title: string; label: string }[]): string[] =>
  entries.map((entry) => `${entry.title} ${entry.label}`)

describe('splitSchedule', () => {
  const entries = buildDeadlineEntries(catalog, tracking)

  it('lists only papers marked submitted after submission, never other tracked conferences', () => {
    const now = Date.parse('2026-12-01T00:00:00Z')
    expect(keys(splitSchedule(entries, tracking, 'upcoming', now).afterSubmission)).toEqual([
      'CVPR 2027 rebuttal',
      'CVPR 2027 notification'
    ])
    const past = Date.parse('2027-03-01T00:00:00Z')
    expect(keys(splitSchedule(entries, tracking, 'past', past).afterSubmission)).toEqual([
      'CVPR 2027 notification',
      'CVPR 2027 rebuttal'
    ])
  })

  it('drops a deadline from the upcoming list once its paper is submitted', () => {
    const now = Date.parse('2026-11-01T00:00:00Z')
    expect(splitSchedule(entries, tracking, 'upcoming', now).deadlines).toEqual([])
  })
})
