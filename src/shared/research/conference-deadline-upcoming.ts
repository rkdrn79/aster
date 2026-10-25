import { resolveDeadlineInstant } from './conference-deadline-time'
import type {
  ConferenceCatalog,
  ConferenceDeadline,
  ConferenceEdition,
  ConferenceTracking,
  CustomConferenceDeadline,
  DeadlineStage,
  SubmissionStatus
} from './conference-deadlines'
import { isTopTier } from './conference-topics'
import type { ResearchDeadlineEntry, ResearchDeadlineSuggestion } from './research-deadlines-api'

// Same rule as the desktop timeline (research-deadline-timeline.ts): before submitting you need the
// deadline; after, the review and decision; once accepted, camera-ready.
const NEXT_STAGES: Record<SubmissionStatus | 'none', ReadonlySet<DeadlineStage>> = {
  none: new Set(['submission']),
  submitted: new Set(['review', 'rebuttal', 'notification']),
  accepted: new Set(['camera-ready']),
  rejected: new Set()
}

type Timed = ResearchDeadlineEntry & { epochMs: number }

const NOTHING_TRACKED: ConferenceTracking = {
  schemaVersion: 1,
  trackedSeries: [],
  customDeadlines: [],
  submissions: [],
  displayTimeZone: null
}

function submissionOf(
  tracking: ConferenceTracking,
  editionId: string | null
): ResearchDeadlineEntry['submission'] {
  const found = tracking.submissions.find((entry) => entry.editionId === editionId)
  return found
    ? { status: found.status, updatedAt: found.updatedAt, project: found.project ?? null }
    : null
}

function timed(
  deadline: Pick<ConferenceDeadline, 'date' | 'timezone' | 'opens'>,
  stage: DeadlineStage,
  submission: ResearchDeadlineEntry['submission']
): Pick<Timed, 'epochMs' | 'at' | 'opensAt' | 'stated' | 'aoeAssumed' | 'actionable'> | null {
  const instant = resolveDeadlineInstant(deadline.date, deadline.timezone)
  if (!instant) {
    return null
  }
  const opens = deadline.opens ? resolveDeadlineInstant(deadline.opens, deadline.timezone) : null
  return {
    epochMs: instant.epochMs,
    at: new Date(instant.epochMs).toISOString(),
    opensAt: opens ? new Date(opens.epochMs).toISOString() : null,
    stated: { date: deadline.date, timezone: deadline.timezone },
    aoeAssumed: !instant.zoneRecognized,
    actionable: NEXT_STAGES[submission?.status ?? 'none'].has(stage)
  }
}

function editionEntries(edition: ConferenceEdition, tracking: ConferenceTracking): Timed[] {
  const submission = submissionOf(tracking, edition.id)
  return edition.deadlines.flatMap((deadline) => {
    const time = timed(deadline, deadline.stage, submission)
    return time
      ? [
          {
            ...time,
            editionId: edition.id,
            series: edition.series,
            conference: `${edition.title} ${edition.year}`,
            stage: deadline.stage,
            label: deadline.label,
            submission,
            link: edition.link ?? null,
            source: deadline.source,
            agreement: deadline.agreement ?? null
          }
        ]
      : []
  })
}

function customEntry(deadline: CustomConferenceDeadline, tracking: ConferenceTracking): Timed[] {
  const stage = deadline.stage ?? 'submission'
  const submission = deadline.editionId ? submissionOf(tracking, deadline.editionId) : null
  const time = timed(deadline, stage, submission)
  if (!time) {
    return []
  }
  return [
    {
      ...time,
      // Why: a hand-added date not tied to an edition is always the user's own next step.
      actionable: deadline.editionId ? time.actionable : true,
      editionId: deadline.editionId ?? null,
      series: null,
      conference: deadline.title,
      stage,
      label: deadline.label,
      submission,
      link: deadline.link ?? null,
      source: 'custom',
      agreement: null
    }
  ]
}

function withoutEpoch({ epochMs: _epochMs, ...entry }: Timed): ResearchDeadlineEntry {
  return entry
}

/** Milestones after `now` of tracked series, submitted papers and hand-added dates, soonest first. */
export function upcomingConferenceDeadlines(
  catalog: ConferenceCatalog | null,
  tracking: ConferenceTracking,
  now: number
): ResearchDeadlineEntry[] {
  const tracked = new Set(tracking.trackedSeries)
  const submitted = new Set(tracking.submissions.map((entry) => entry.editionId))
  return [
    ...(catalog?.editions ?? [])
      .filter((edition) => tracked.has(edition.series) || submitted.has(edition.id))
      .flatMap((edition) => editionEntries(edition, tracking)),
    ...tracking.customDeadlines.flatMap((deadline) => customEntry(deadline, tracking))
  ]
    .filter((entry) => entry.epochMs >= now)
    .sort((left, right) => left.epochMs - right.epochMs)
    .map(withoutEpoch)
}

/** Each series' next submission deadline after `now`; top-tier venues first, then by date. */
export function suggestConferenceSeries(
  catalog: ConferenceCatalog | null,
  now: number,
  limit: number
): ResearchDeadlineSuggestion[] {
  const next = new Map<string, { edition: ConferenceEdition; entry: Timed }>()
  for (const edition of catalog?.editions ?? []) {
    for (const entry of editionEntries(edition, NOTHING_TRACKED)) {
      const current = next.get(edition.series)
      if (
        entry.stage === 'submission' &&
        entry.epochMs >= now &&
        (!current || entry.epochMs < current.entry.epochMs)
      ) {
        next.set(edition.series, { edition, entry })
      }
    }
  }
  return [...next.values()]
    .map(({ edition, entry }) => ({
      series: edition.series,
      title: edition.title,
      fullName: edition.fullName ?? null,
      topTier: isTopTier(edition.rank),
      epochMs: entry.epochMs,
      next: {
        editionId: entry.editionId,
        label: entry.label,
        at: entry.at,
        stated: entry.stated,
        aoeAssumed: entry.aoeAssumed
      }
    }))
    .sort(
      (left, right) => Number(right.topTier) - Number(left.topTier) || left.epochMs - right.epochMs
    )
    .slice(0, limit)
    .map(({ epochMs: _epochMs, ...suggestion }) => suggestion)
}
