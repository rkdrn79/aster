import type { DeadlineStage } from './conference-deadlines'

// Why: ordered, because labels mix words ("Rebuttal and Revision Submission" is a rebuttal).
const STAGE_PATTERNS: [RegExp, DeadlineStage][] = [
  [/camera|final.version|final.paper/, 'camera-ready'],
  [/author.registration|early.registration|conference.registration/, 'camera-ready'],
  [/notification|decision|acceptance/, 'notification'],
  [/rebuttal|author.response|author.feedback|discussion|revision|resubmission/, 'rebuttal'],
  [/reviewer|workshop|tutorial|proposal|demo/, 'other'],
  [/review|commitment|withdraw/, 'review'],
  [/abstract|paper|submission|supplement|registration|upload|full|deadline/, 'submission']
]

export function classifyDeadlineStage(type: string, label: string): DeadlineStage {
  const text = `${type} ${label}`.toLowerCase().replace(/[_-]+/g, ' ')
  return STAGE_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? 'other'
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec'
] as const

/** First day of an event from text such as `June 19-26, 2027`; null when it cannot be read. */
export function parseEventStart(text: string | undefined, year: number): string | null {
  const match = /([A-Za-z]{3,})\.?\s+(\d{1,2})/.exec(text ?? '')
  const month = match ? MONTHS.findIndex((name) => match[1].toLowerCase().startsWith(name)) : -1
  if (!match || month === -1) {
    return null
  }
  const day = Number(match[2])
  const stated = Number(/\b(\d{4})\b/.exec(text ?? '')?.[1] ?? year)
  const date = new Date(Date.UTC(stated, month, day))
  return date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null
}
