import { z } from 'zod'

export type OpenReviewReview = {
  noteId: string
  /** "Reviewer AbCd", from the anonymous signature. */
  label: string
  rating: string | null
  confidence: string | null
  /** The review's text fields as Markdown sections, in the venue's reading order. */
  text: string
  createdAt: number | null
}

export type OpenReviewForumReviews = {
  forum: string
  title: string | null
  venue: string | null
  reviews: OpenReviewReview[]
}

const FORUM_ID = /^[A-Za-z0-9_-]{4,64}$/
const REVIEW_INVITATION = /\/-\/(?:Official_Review|Review)$/
const RATING_FIELDS = ['rating', 'recommendation', 'overall_rating', 'overall_recommendation']
const SKIPPED_FIELDS = new Set([
  'title',
  'confidence',
  'code_of_conduct',
  'flag_for_ethics_review',
  'first_time_reviewer',
  ...RATING_FIELDS
])
// Why an order: v2 notes carry no field order, and reviews read summary → strengths → weaknesses.
const READING_ORDER = [
  'summary',
  'summary_of_the_paper',
  'paper_summary',
  'strengths',
  'strengths_and_weaknesses',
  'strength_and_weaknesses',
  'weaknesses',
  'main_review',
  'questions',
  'questions_for_authors',
  'limitations',
  'clarity,_quality,_novelty_and_reproducibility',
  'summary_of_the_review',
  'details_of_ethics_concerns'
]

const noteSchema = z
  .object({
    id: z.string().min(1).max(200),
    forum: z.string().max(200).optional(),
    invitations: z.array(z.string()).optional(),
    invitation: z.string().optional(),
    signatures: z.array(z.string()).optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    cdate: z.number().nullable().optional(),
    tcdate: z.number().nullable().optional()
  })
  .passthrough()
const notesSchema = z.object({ notes: z.array(z.unknown()) }).passthrough()

type Note = z.infer<typeof noteSchema>

/** The forum ID in an OpenReview link (`…/forum?id=XYZ`) or a bare ID. */
export function openReviewForumId(input: string): string | null {
  const trimmed = input.trim()
  if (FORUM_ID.test(trimmed)) {
    return trimmed
  }
  try {
    const url = new URL(trimmed)
    if (!/(^|\.)openreview\.net$/i.test(url.hostname)) {
      return null
    }
    const id = url.searchParams.get('id') ?? url.searchParams.get('forum')
    return id && FORUM_ID.test(id) ? id : null
  } catch {
    return null
  }
}

/** API v2 wraps each field as `{ value }`; API v1 stores the value itself. */
function fieldValue(value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) && 'value' in value
    ? Reflect.get(value, 'value')
    : value
}

function shortScore(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  const leading = /^\s*(-?\d+(?:\.\d+)?)\s*:/.exec(value)
  return (leading ? leading[1] : value.trim()).slice(0, 120)
}

function fieldLabel(key: string): string {
  const words = key.replace(/[_,]+/g, ' ').replace(/\s+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function reviewText(content: Record<string, unknown>): string {
  const keys = Object.keys(content).filter((key) => !SKIPPED_FIELDS.has(key))
  const rank = (key: string): number => {
    const index = READING_ORDER.indexOf(key)
    return index === -1 ? READING_ORDER.length : index
  }
  const ordered = keys.toSorted((left, right) => rank(left) - rank(right))
  const scores = ordered.flatMap((key) => {
    const value = fieldValue(content[key])
    return typeof value === 'number' ? [`${fieldLabel(key)} ${value}`] : []
  })
  const sections = ordered.flatMap((key) => {
    const value = fieldValue(content[key])
    return typeof value === 'string' && value.trim() ? [`${fieldLabel(key)}:\n${value.trim()}`] : []
  })
  return [...(scores.length ? [`Scores: ${scores.join(' · ')}`] : []), ...sections].join('\n\n')
}

function reviewerLabel(note: Note): string {
  const signature = note.signatures?.[0] ?? ''
  const name = signature.split('/').pop() ?? ''
  const anonymous = /^(?:Reviewer|AnonReviewer)_?(\w+)$/.exec(name)
  return anonymous ? `Reviewer ${anonymous[1]}` : name.replace(/_/g, ' ') || 'Reviewer'
}

function isReview(note: Note): boolean {
  const invitations = [...(note.invitations ?? []), ...(note.invitation ? [note.invitation] : [])]
  return invitations.some((invitation) => REVIEW_INVITATION.test(invitation))
}

/** The official reviews of one forum from an OpenReview `/notes?forum=` reply (API v1 or v2). */
export function parseOpenReviewNotes(forum: string, payload: unknown): OpenReviewForumReviews {
  const notes = notesSchema
    .parse(payload)
    .notes.flatMap((entry) => {
      const parsed = noteSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
    .filter((note) => !note.forum || note.forum === forum)
  const submission = notes.find((note) => note.id === forum)
  const title = fieldValue(submission?.content?.title)
  const venue = fieldValue(submission?.content?.venue)
  const reviews = notes
    .filter(isReview)
    .map((note) => {
      const content = note.content ?? {}
      const rating = RATING_FIELDS.map((key) => shortScore(fieldValue(content[key]))).find(Boolean)
      return {
        noteId: note.id,
        label: reviewerLabel(note),
        rating: rating ?? null,
        confidence: shortScore(fieldValue(content.confidence)),
        text: reviewText(content),
        createdAt: note.cdate ?? note.tcdate ?? null
      }
    })
    .filter((review) => review.text)
    .toSorted((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
  return {
    forum,
    title: typeof title === 'string' ? title : null,
    venue: typeof venue === 'string' ? venue : null,
    reviews
  }
}
