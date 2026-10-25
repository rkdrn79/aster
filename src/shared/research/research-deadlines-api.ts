import { z } from 'zod'
import { OptionalBoolean } from '../rpc-contract/rpc-param-primitives'
import {
  submissionStatusSchema,
  type ConferenceSource,
  type DeadlineStage,
  type SubmissionStatus
} from './conference-deadlines'

/**
 * `researchDeadlines.*`: conference deadlines this host tracks, kept in its own data root.
 * Bumped only on a breaking change to a result below; added fields keep the version.
 */
export const RESEARCH_DEADLINES_API_VERSION = 1

export const ResearchDeadlinesReadParams = z.object({
  /** Wait for a fresh catalog download (pull to refresh); otherwise a stale catalog refreshes behind. */
  refresh: OptionalBoolean
})

const seriesSchema = z.string().trim().min(1).max(64)

export const researchDeadlinesUpdateOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('track'), series: seriesSchema }),
  z.object({ op: z.literal('untrack'), series: seriesSchema }),
  z.object({
    op: z.literal('setSubmission'),
    editionId: z.string().trim().min(1).max(80),
    /** Null forgets the submission. */
    status: submissionStatusSchema.nullable(),
    /** Omitted keeps the current project; null clears it. */
    project: z.string().trim().min(1).max(512).nullable().optional()
  })
])
export type ResearchDeadlinesUpdateOp = z.infer<typeof researchDeadlinesUpdateOpSchema>

export const ResearchDeadlinesUpdateParams = z.object({
  /** The `revision` the caller last read; a newer document refuses the ops. */
  revision: z.number().int().nonnegative(),
  ops: z.array(researchDeadlinesUpdateOpSchema).min(1).max(50)
})

export type ResearchDeadlineEntry = {
  /** Null for a date the user added by hand. */
  editionId: string | null
  series: string | null
  /** `ICML 2027`, or a hand-added deadline's title. */
  conference: string
  stage: DeadlineStage
  label: string
  /** The deadline as an instant, ISO 8601 in UTC. */
  at: string
  /** Start of a window such as a rebuttal period, ISO 8601 in UTC. */
  opensAt: string | null
  /** The wall-clock time and zone exactly as the call for papers states them. */
  stated: { date: string; timezone: string }
  /** The stated zone was missing or unknown, so Anywhere on Earth (UTC-12) was assumed. */
  aoeAssumed: boolean
  submission: { status: SubmissionStatus; updatedAt: string; project: string | null } | null
  /** What the author acts on next, given the submission's status (the desktop's rule). */
  actionable: boolean
  link: string | null
  source: ConferenceSource | 'custom'
  /** Whether the other source lists the same submission date. */
  agreement: 'confirmed' | 'disputed' | null
}

export type ResearchDeadlineSuggestion = {
  series: string
  title: string
  fullName: string | null
  topTier: boolean
  next: Pick<ResearchDeadlineEntry, 'editionId' | 'label' | 'at' | 'stated' | 'aoeAssumed'>
}

export type ResearchDeadlinesReadResult = {
  version: typeof RESEARCH_DEADLINES_API_VERSION
  /** Pass to `researchDeadlines.update`. */
  revision: number
  trackedSeries: string[]
  /** Upcoming milestones of tracked series and submitted papers, soonest first. */
  upcoming: ResearchDeadlineEntry[]
  /** Upcoming milestones past the reply cap. */
  omitted: number
  /** Only while nothing is tracked: soon-closing conferences, top-tier first. */
  suggestions: ResearchDeadlineSuggestion[]
  catalog: {
    status: 'absent' | 'present'
    /** Newest source download. */
    fetchedAt: string | null
    sources: { source: ConferenceSource; fetchedAt: string | null; failed: boolean }[]
    stale: boolean
    /** A download is running on this host; read again for its result. */
    refreshing: boolean
    /** Why the last download on this host failed, until one succeeds. */
    lastError: string | null
  }
  readAt: string
}

export type ResearchDeadlinesUpdateResult = {
  version: typeof RESEARCH_DEADLINES_API_VERSION
  /** `conflict`: the document moved past the caller's revision; nothing was written. */
  status: 'saved' | 'conflict'
  deadlines: ResearchDeadlinesReadResult
}
