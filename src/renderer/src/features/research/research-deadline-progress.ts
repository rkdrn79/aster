import type {
  ConferenceCatalog,
  ConferenceEdition,
  ConferenceTracking,
  DeadlineStage
} from '../../../../shared/research/conference-deadlines'
import {
  isTopTier,
  type ConferenceRank,
  type ConferenceTopic
} from '../../../../shared/research/conference-topics'
import {
  buildCatalogDeadlineEntries,
  submissionStatusOf,
  type DeadlineEntry
} from './research-deadline-timeline'

export type ConferenceSeriesSummary = {
  series: string
  title: string
  fullName: string | null
  latestYear: number
  /** Event dates of the newest edition, e.g. `June 19-26, 2027`. */
  latestDates: string | null
  topic: ConferenceTopic
  rank: ConferenceRank
  topTier: boolean
  next: DeadlineEntry | null
}

export type MissingMilestone = {
  key: string
  editionId: string
  title: string
  stage: Extract<DeadlineStage, 'notification' | 'camera-ready'>
  label: string
  /** Zone the conference states its other dates in, to prefill the form. */
  timezone: string
}

export type SubmissionPrompt = { editionId: string; series: string; title: string }

const PROMPT_WINDOW_MS = 120 * 24 * 60 * 60 * 1000

/** One row per conference: its newest edition and next submission deadline. */
export function summarizeConferenceSeries(
  catalog: ConferenceCatalog | null,
  now: number
): ConferenceSeriesSummary[] {
  const summaries = new Map<string, ConferenceSeriesSummary>()
  for (const edition of catalog?.editions ?? []) {
    const current = summaries.get(edition.series)
    if (!current || edition.year > current.latestYear) {
      summaries.set(edition.series, {
        series: edition.series,
        title: edition.title,
        fullName: edition.fullName ?? null,
        latestYear: edition.year,
        latestDates: edition.dates ?? null,
        topic: edition.topic,
        rank: edition.rank,
        topTier: isTopTier(edition.rank),
        next: current?.next ?? null
      })
    }
  }
  for (const entry of buildCatalogDeadlineEntries(catalog)) {
    const summary = entry.series ? summaries.get(entry.series) : undefined
    if (
      summary &&
      entry.epochMs >= now &&
      (!summary.next || entry.epochMs < summary.next.epochMs)
    ) {
      summary.next = entry
    }
  }
  return [...summaries.values()].sort((left, right) => {
    if (left.next && right.next) {
      return left.next.epochMs - right.next.epochMs
    }
    if (left.next || right.next) {
      return left.next ? -1 : 1
    }
    return left.title.localeCompare(right.title)
  })
}

function hasMilestone(
  edition: ConferenceEdition,
  tracking: ConferenceTracking,
  stage: DeadlineStage
): boolean {
  return (
    edition.deadlines.some((deadline) => deadline.stage === stage) ||
    tracking.customDeadlines.some(
      (deadline) => deadline.editionId === edition.id && deadline.stage === stage
    )
  )
}

/** Dates an author now needs but neither source lists, so the user can enter them. */
export function missingMilestones(
  catalog: ConferenceCatalog | null,
  tracking: ConferenceTracking
): MissingMilestone[] {
  return tracking.submissions.flatMap((submission) => {
    const edition = catalog?.editions.find((entry) => entry.id === submission.editionId)
    const needed =
      submission.status === 'submitted'
        ? { stage: 'notification' as const, label: 'Author notification' }
        : submission.status === 'accepted'
          ? { stage: 'camera-ready' as const, label: 'Camera-ready' }
          : null
    if (!edition || !needed || hasMilestone(edition, tracking, needed.stage)) {
      return []
    }
    return [
      {
        key: `${edition.id}:${needed.stage}`,
        editionId: edition.id,
        title: `${edition.title} ${edition.year}`,
        ...needed,
        timezone: edition.deadlines[0]?.timezone || 'AoE'
      }
    ]
  })
}

/** Tracked editions whose submission just closed but are not yet marked submitted. */
export function submissionPrompts(
  catalog: ConferenceCatalog | null,
  tracking: ConferenceTracking,
  entries: DeadlineEntry[],
  now: number
): SubmissionPrompt[] {
  const tracked = new Set(tracking.trackedSeries)
  return (catalog?.editions ?? []).flatMap((edition) => {
    if (!tracked.has(edition.series) || submissionStatusOf(tracking, edition.id) !== 'none') {
      return []
    }
    const closes = entries
      .filter((entry) => entry.editionId === edition.id && entry.stage === 'submission')
      .map((entry) => entry.epochMs)
    const lastClose = closes.length ? Math.max(...closes) : null
    return lastClose !== null && lastClose < now && now - lastClose < PROMPT_WINDOW_MS
      ? [
          {
            editionId: edition.id,
            series: edition.series,
            title: `${edition.title} ${edition.year}`
          }
        ]
      : []
  })
}
