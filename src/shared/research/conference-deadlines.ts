import { z } from 'zod'
import { conferenceRankSchema, conferenceTopicSchema } from './conference-topics'

export const CONFERENCE_SOURCES = {
  ccfddl: { name: 'ccfddl/ccf-deadlines', url: 'https://github.com/ccfddl/ccf-deadlines' },
  huggingface: {
    name: 'huggingface/ai-deadlines',
    url: 'https://github.com/huggingface/ai-deadlines'
  }
} as const

export const conferenceSourceSchema = z.enum(['ccfddl', 'huggingface'])

/** Where a milestone sits in a paper's life; it decides what an author needs to see next. */
export const deadlineStageSchema = z.enum([
  'submission',
  'review',
  'rebuttal',
  'notification',
  'camera-ready',
  'other'
])

const wallClockSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/)

const httpUrlSchema = z
  .url()
  .regex(/^https?:\/\//i)
  .max(2048)

export const conferenceDeadlineSchema = z
  .object({
    type: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(160),
    stage: deadlineStageSchema,
    /** Wall-clock time exactly as the call for papers states it, read in `timezone`. */
    date: wallClockSchema,
    /** Start of a window such as a rebuttal period, in the same zone as `date`. */
    opens: wallClockSchema.optional(),
    timezone: z.string().trim().max(64),
    note: z.string().trim().max(300).optional(),
    source: conferenceSourceSchema,
    /** Set after merging: whether the other source lists the same submission date. */
    agreement: z.enum(['confirmed', 'disputed']).optional()
  })
  .strict()

export const conferenceEditionSchema = z
  .object({
    /** `<series>-<year>`, identical across sources so their records merge. */
    id: z.string().trim().min(1).max(80),
    /** Stable key shared by every year of a conference, e.g. `icml`. */
    series: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(120),
    year: z.number().int().min(1900).max(9999),
    fullName: z.string().trim().max(300).optional(),
    link: httpUrlSchema.optional(),
    dates: z.string().trim().max(120).optional(),
    /** First day of the conference itself, `YYYY-MM-DD`. */
    start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    place: z.string().trim().max(240).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20),
    /** CCF category code, e.g. `AI`. */
    category: z.string().trim().max(8).optional(),
    topic: conferenceTopicSchema,
    rank: conferenceRankSchema,
    deadlines: z.array(conferenceDeadlineSchema).max(60)
  })
  .strict()

export const conferenceSourceSnapshotSchema = z
  .object({
    source: conferenceSourceSchema,
    fetchedAt: z.string(),
    editions: z.array(conferenceEditionSchema).max(5000)
  })
  .strict()

/** On-disk cache: one snapshot per source so a failed source keeps its last good copy. */
export const conferenceCatalogCacheSchema = z
  .object({
    schemaVersion: z.literal(2),
    snapshots: z.array(conferenceSourceSnapshotSchema).max(4)
  })
  .strict()

export type ConferenceSource = z.infer<typeof conferenceSourceSchema>
export type DeadlineStage = z.infer<typeof deadlineStageSchema>
export type ConferenceDeadline = z.infer<typeof conferenceDeadlineSchema>
export type ConferenceEdition = z.infer<typeof conferenceEditionSchema>
export type ConferenceSourceSnapshot = z.infer<typeof conferenceSourceSnapshotSchema>
export type ConferenceCatalogCache = z.infer<typeof conferenceCatalogCacheSchema>

/** Merged view handed to the renderer. */
export type ConferenceCatalog = {
  fetchedAt: string
  sources: { source: ConferenceSource; fetchedAt: string | null; failed: boolean }[]
  editions: ConferenceEdition[]
}

export const customConferenceDeadlineSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
    date: wallClockSchema,
    timezone: z.string().trim().min(1).max(64),
    link: httpUrlSchema.optional(),
    /** Ties a date the sources lack (e.g. notification) to a tracked edition. */
    editionId: z.string().trim().min(1).max(80).optional(),
    stage: deadlineStageSchema.optional(),
    createdAt: z.string()
  })
  .strict()

export const submissionStatusSchema = z.enum(['submitted', 'accepted', 'rejected'])

export const conferenceSubmissionSchema = z
  .object({
    editionId: z.string().trim().min(1).max(80),
    status: submissionStatusSchema,
    updatedAt: z.string(),
    /** The project the paper comes from, as a worktree selector (`id:<worktreeId>`) or a name. */
    project: z.string().trim().min(1).max(512).optional()
  })
  .strict()

export const conferenceTrackingSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative().optional(),
    trackedSeries: z.array(z.string().trim().min(1).max(64)).max(500),
    customDeadlines: z.array(customConferenceDeadlineSchema).max(500),
    submissions: z.array(conferenceSubmissionSchema).max(500).default([]),
    /** IANA zone chosen by the user; null follows the operating system. */
    displayTimeZone: z.string().trim().min(1).max(64).nullable()
  })
  .strict()
  .refine(
    (document) =>
      new Set(document.trackedSeries).size === document.trackedSeries.length &&
      new Set(document.submissions.map((entry) => entry.editionId)).size ===
        document.submissions.length,
    'Tracked conferences and submissions must be unique'
  )

export type CustomConferenceDeadline = z.infer<typeof customConferenceDeadlineSchema>
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>
export type ConferenceTracking = z.infer<typeof conferenceTrackingSchema>

export function emptyConferenceTracking(): ConferenceTracking {
  return {
    schemaVersion: 1,
    revision: 0,
    trackedSeries: [],
    customDeadlines: [],
    submissions: [],
    displayTimeZone: null
  }
}

const SERIES_ALIASES: Record<string, string> = { ieeecec: 'cec' }

/** Lower-case alphanumeric title, so `ECML PKDD` and `ecml_pkdd` name the same series. */
export function conferenceSeriesKey(title: string): string {
  const key = title.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return SERIES_ALIASES[key] ?? key
}
