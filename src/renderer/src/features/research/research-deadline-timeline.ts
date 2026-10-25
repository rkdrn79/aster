import { resolveDeadlineInstant } from '../../../../shared/research/conference-deadline-time'
import type {
  ConferenceCatalog,
  ConferenceEdition,
  ConferenceSource,
  ConferenceTracking,
  CustomConferenceDeadline,
  DeadlineStage,
  SubmissionStatus
} from '../../../../shared/research/conference-deadlines'
import { isTopTier, type ConferenceTopic } from '../../../../shared/research/conference-topics'

export type EditionStatus = SubmissionStatus | 'none'
export type TimelineStage = DeadlineStage | 'event'

export type DeadlineEntry = {
  key: string
  series: string | null
  editionId: string | null
  customId: string | null
  title: string
  label: string
  type: string
  stage: TimelineStage
  /** Wall-clock text as the conference states it, read in `timezone`. */
  wallClock: string
  timezone: string
  epochMs: number
  /** Start of a window such as a rebuttal period. */
  opensMs: number | null
  /** The conference itself: a date, not a moment. */
  allDay: boolean
  zoneRecognized: boolean
  link: string | null
  source: ConferenceSource | 'custom'
  agreement: 'confirmed' | 'disputed' | null
  note: string | null
  topic: ConferenceTopic | null
  topTier: boolean
  /** Something the author acts on next, given where their paper is. */
  actionable: boolean
}

// Why: before submitting you need the deadline; after, the rebuttal and decision; once in, camera-ready.
const NEXT_STAGES: Record<EditionStatus, ReadonlySet<TimelineStage>> = {
  none: new Set(['submission']),
  submitted: new Set(['review', 'rebuttal', 'notification']),
  accepted: new Set(['camera-ready', 'event']),
  rejected: new Set()
}

export function submissionStatusOf(
  tracking: ConferenceTracking | null,
  editionId: string | null
): EditionStatus {
  return tracking?.submissions.find((entry) => entry.editionId === editionId)?.status ?? 'none'
}

function editionEntries(edition: ConferenceEdition, status: EditionStatus): DeadlineEntry[] {
  const base = {
    series: edition.series,
    editionId: edition.id,
    customId: null,
    title: `${edition.title} ${edition.year}`,
    link: edition.link ?? null,
    topic: edition.topic,
    topTier: isTopTier(edition.rank)
  }
  const deadlines = edition.deadlines.flatMap((deadline, index) => {
    const instant = resolveDeadlineInstant(deadline.date, deadline.timezone)
    if (!instant) {
      return []
    }
    const opens = deadline.opens ? resolveDeadlineInstant(deadline.opens, deadline.timezone) : null
    return [
      {
        ...base,
        key: `${edition.id}:${deadline.source}:${index}`,
        label: deadline.label,
        type: deadline.type,
        stage: deadline.stage,
        wallClock: deadline.date,
        timezone: deadline.timezone,
        epochMs: instant.epochMs,
        opensMs: opens?.epochMs ?? null,
        allDay: false,
        zoneRecognized: instant.zoneRecognized,
        source: deadline.source,
        agreement: deadline.agreement ?? null,
        note: deadline.note ?? null,
        actionable: NEXT_STAGES[status].has(deadline.stage)
      }
    ]
  })
  const start = edition.start ? resolveDeadlineInstant(`${edition.start} 00:00`, 'UTC') : null
  if (!start) {
    return deadlines
  }
  const event: DeadlineEntry = {
    ...base,
    key: `${edition.id}:event`,
    label: 'Conference',
    type: 'event',
    stage: 'event',
    wallClock: edition.start ?? '',
    timezone: 'UTC',
    epochMs: start.epochMs,
    opensMs: null,
    allDay: true,
    zoneRecognized: true,
    source: 'custom',
    agreement: null,
    note: [edition.dates, edition.place].filter(Boolean).join(' · ') || null,
    actionable: NEXT_STAGES[status].has('event')
  }
  return [...deadlines, event]
}

function customEntry(
  deadline: CustomConferenceDeadline,
  tracking: ConferenceTracking
): DeadlineEntry | null {
  const instant = resolveDeadlineInstant(deadline.date, deadline.timezone)
  if (!instant) {
    return null
  }
  const stage = deadline.stage ?? 'submission'
  return {
    key: `custom:${deadline.id}`,
    series: null,
    editionId: deadline.editionId ?? null,
    customId: deadline.id,
    title: deadline.title,
    label: deadline.label,
    type: 'custom',
    stage,
    wallClock: deadline.date,
    timezone: deadline.timezone,
    epochMs: instant.epochMs,
    opensMs: null,
    allDay: false,
    zoneRecognized: instant.zoneRecognized,
    link: deadline.link ?? null,
    source: 'custom',
    agreement: null,
    note: null,
    topic: null,
    topTier: false,
    actionable: deadline.editionId
      ? NEXT_STAGES[submissionStatusOf(tracking, deadline.editionId)].has(stage)
      : true
  }
}

function byTime(left: DeadlineEntry, right: DeadlineEntry): number {
  return left.epochMs - right.epochMs
}

/** Every milestone of tracked conferences and of papers marked submitted, plus custom dates. */
export function buildDeadlineEntries(
  catalog: ConferenceCatalog | null,
  tracking: ConferenceTracking
): DeadlineEntry[] {
  const tracked = new Set(tracking.trackedSeries)
  const submitted = new Set(tracking.submissions.map((entry) => entry.editionId))
  const editions = (catalog?.editions ?? []).filter(
    (edition) => tracked.has(edition.series) || submitted.has(edition.id)
  )
  return [
    ...editions.flatMap((edition) =>
      editionEntries(edition, submissionStatusOf(tracking, edition.id))
    ),
    ...tracking.customDeadlines.flatMap((deadline) => customEntry(deadline, tracking) ?? [])
  ].sort(byTime)
}

/** Every conference's submission dates, for browsing before anything is tracked. */
export function buildCatalogDeadlineEntries(catalog: ConferenceCatalog | null): DeadlineEntry[] {
  return (catalog?.editions ?? [])
    .flatMap((edition) => editionEntries(edition, 'none'))
    .filter((entry) => entry.actionable)
    .sort(byTime)
}

export type DeadlineCategory = 'deadline' | 'after-submission'

/** Deadlines are what you submit by; everything after (rebuttal, decision, camera-ready) follows a submission. */
export function deadlineCategory(entry: Pick<DeadlineEntry, 'stage'>): DeadlineCategory {
  return entry.stage === 'submission' || entry.stage === 'other' ? 'deadline' : 'after-submission'
}

export type ScheduleRange = 'upcoming' | 'past'

const PAST_WINDOW_MS = 365 * 24 * 60 * 60 * 1000

/**
 * What each tab lists. Deadlines: what is still open to submit (or, looking back, every deadline
 * of a tracked conference). After submission: only the user's own papers — what each needs next,
 * or looking back, that paper's history — never other conferences' review calendars.
 */
export function splitSchedule(
  entries: DeadlineEntry[],
  tracking: ConferenceTracking | null,
  range: ScheduleRange,
  now: number
): { deadlines: DeadlineEntry[]; afterSubmission: DeadlineEntry[] } {
  const inRange = (entry: DeadlineEntry): boolean =>
    range === 'upcoming'
      ? entry.epochMs >= now && entry.actionable
      : entry.epochMs < now && entry.epochMs >= now - PAST_WINDOW_MS
  const ordered = (list: DeadlineEntry[]): DeadlineEntry[] =>
    range === 'past' ? list.toReversed() : list
  return {
    deadlines: ordered(
      entries.filter((entry) => deadlineCategory(entry) === 'deadline' && inRange(entry))
    ),
    afterSubmission: ordered(
      entries.filter(
        (entry) =>
          deadlineCategory(entry) === 'after-submission' &&
          submissionStatusOf(tracking, entry.editionId) !== 'none' &&
          inRange(entry)
      )
    )
  }
}

export function isActionableDeadline(entry: DeadlineEntry): boolean {
  return entry.actionable
}

export function isSubmissionDeadline(entry: DeadlineEntry): boolean {
  return entry.stage === 'submission'
}

export function nextUpcomingDeadline(entries: DeadlineEntry[], now: number): DeadlineEntry | null {
  return entries.find((entry) => entry.epochMs >= now && entry.actionable) ?? null
}
