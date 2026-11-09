import {
  integer,
  invalid,
  isObject,
  nullableText,
  oneOf,
  text,
  uniqueIds
} from './research-rebuttal-fields.mjs'

// Why no node imports: the app parses and writes the same files in the renderer.
export const REBUTTAL_SCHEMA_VERSION = 1
export const DEFAULT_REPLY_CHAR_LIMIT = 5000
export const POINT_KINDS = ['weakness', 'question', 'minor']
export const POINT_TYPES = [
  'experiment-request',
  'clarity',
  'related-work',
  'novelty',
  'soundness',
  'reproducibility',
  'presentation',
  'typo',
  'other'
]
export const CLUSTER_ACTIONS = ['experiment', 'text', 'clarify']
export const CLUSTER_STATUSES = ['todo', 'drafting', 'done']
/** Where a shared answer is written in full: the first reviewer's reply, the general response, or every reply. */
export const SHARED_ANSWER_MODES = ['reviewer', 'general', 'repeat']
export const MAX_REVIEW_CHARS = 200_000
// Why: reviews stay confidential until the paper is public, so a rebuttal folder is kept out of the
// project's Git history. Deleting this file lets coauthors share the folder through Git.
export const REBUTTAL_GITIGNORE = `# Written by Aster: reviews stay private until the paper is public.
# Delete this file to commit the rebuttal folder.
*
`

export const KIND_LETTER = { weakness: 'W', question: 'Q', minor: 'M' }
const REVIEWER_ID = /^R[1-9][0-9]?$/
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A folder name for a rebuttal, e.g. "ICLR 2027 round 1" → "iclr-2027-round-1". */
export function rebuttalSlug(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  if (!SLUG.test(slug)) {
    throw invalid('Rebuttal name must contain letters or digits')
  }
  return slug
}

export function safeRebuttalSlug(value) {
  if (typeof value !== 'string' || !SLUG.test(value)) {
    throw invalid('Rebuttal slug must use 1–64 lowercase letters, digits, or hyphens')
  }
  return value
}

export function safeReviewerId(value) {
  if (typeof value !== 'string' || !REVIEWER_ID.test(value)) {
    throw invalid(`Reviewer ID must look like R1 … R99, got: ${String(value)}`)
  }
  return value
}

export function pointLetter(kind) {
  return KIND_LETTER[kind]
}

/** R1-W2 → "W2": a point's label inside its own reviewer's reply. */
export function localPointLabel(pointId) {
  return pointId.replace(/^R[0-9]+-/, '')
}

export function reviewerSortKey(reviewerId) {
  return Number(reviewerId.slice(1))
}

export function newRebuttalMeta({ name, slug, venue, forum, replyChars, now }) {
  return parseRebuttalMeta({
    schemaVersion: REBUTTAL_SCHEMA_VERSION,
    slug: slug ?? rebuttalSlug(name),
    name,
    venue: venue ?? '',
    forum: forum ?? null,
    limits: { replyChars: replyChars ?? DEFAULT_REPLY_CHAR_LIMIT },
    reviewers: [],
    general: { intro: '', closing: '' },
    createdAt: now,
    updatedAt: now
  })
}

export function parseRebuttalMeta(value) {
  if (!isObject(value) || value.schemaVersion !== REBUTTAL_SCHEMA_VERSION) {
    throw invalid(`rebuttal.json must be an object with schemaVersion ${REBUTTAL_SCHEMA_VERSION}`)
  }
  const limits = isObject(value.limits) ? value.limits : {}
  const general = isObject(value.general) ? value.general : {}
  const assembly = isObject(value.assembly) ? value.assembly : {}
  const reviewers = (Array.isArray(value.reviewers) ? value.reviewers : []).map((entry, index) => {
    if (!isObject(entry)) {
      throw invalid(`reviewers[${index}] must be an object`)
    }
    return {
      ...entry,
      id: safeReviewerId(entry.id),
      label: text(entry.label, `${entry.id} label`, { max: 120 }),
      rating: nullableText(entry.rating, `${entry.id} rating`, 120),
      confidence: nullableText(entry.confidence, `${entry.id} confidence`, 120),
      source: oneOf(entry.source, `${entry.id} source`, ['paste', 'openreview'], 'paste'),
      noteId: nullableText(entry.noteId, `${entry.id} noteId`, 200),
      opening: text(entry.opening, `${entry.id} opening`, { max: 5000 })
    }
  })
  uniqueIds(reviewers, 'reviewer')
  reviewers.sort((left, right) => reviewerSortKey(left.id) - reviewerSortKey(right.id))
  return {
    ...value,
    schemaVersion: REBUTTAL_SCHEMA_VERSION,
    slug: safeRebuttalSlug(value.slug),
    name: text(value.name, 'Rebuttal name', { max: 160, required: true }),
    venue: text(value.venue, 'Venue', { max: 160 }),
    forum: nullableText(value.forum, 'OpenReview forum', 200),
    limits: {
      ...limits,
      replyChars: integer(limits.replyChars, 'limits.replyChars', {
        min: 200,
        max: 100_000,
        fallback: DEFAULT_REPLY_CHAR_LIMIT
      }),
      generalChars: integer(limits.generalChars, 'limits.generalChars', {
        min: 200,
        max: 100_000,
        fallback: DEFAULT_REPLY_CHAR_LIMIT
      }),
      pdfPages: integer(limits.pdfPages, 'limits.pdfPages', { min: 1, max: 5, fallback: 1 })
    },
    reviewers,
    general: {
      ...general,
      intro: text(general.intro, 'General intro', { max: 10_000 }),
      closing: text(general.closing, 'General closing', { max: 10_000 })
    },
    assembly: {
      ...assembly,
      shared: oneOf(assembly.shared, 'assembly.shared', SHARED_ANSWER_MODES, 'reviewer')
    },
    createdAt: text(value.createdAt, 'createdAt', { max: 64 }),
    updatedAt: text(value.updatedAt, 'updatedAt', { max: 64 })
  }
}

/** The next free ID with `prefix` (C, P) after the highest one in use. */
export function nextSequentialId(prefix, items) {
  const highest = items.reduce((max, item) => Math.max(max, Number(item.id.slice(1)) || 0), 0)
  return `${prefix}${highest + 1}`
}

export function nextReviewerId(reviewers) {
  return `R${reviewers.reduce((max, reviewer) => Math.max(max, reviewerSortKey(reviewer.id)), 0) + 1}`
}

/** One file's contents, the way both the harness and the app write it. */
export function serializeRebuttalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function pointsDocument(points) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, points }
}

export function clustersDocument(clusters) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, clusters }
}

export function promisesDocument(promises) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, promises }
}
