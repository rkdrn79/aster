export type RebuttalPointKind = 'weakness' | 'question' | 'minor'
export type RebuttalPointOrigin = 'review' | 'prediction'
export type RebuttalReplyAuthor = 'human' | 'agent' | 'both'
export type RebuttalPointType =
  | 'experiment-request'
  | 'clarity'
  | 'related-work'
  | 'novelty'
  | 'soundness'
  | 'reproducibility'
  | 'presentation'
  | 'typo'
  | 'other'
export type RebuttalClusterAction = 'experiment' | 'text' | 'clarify'
export type RebuttalClusterStatus = 'todo' | 'drafting' | 'done'
export type RebuttalSharedAnswerMode = 'reviewer' | 'general' | 'repeat'

export type RebuttalReviewer = {
  id: string
  label: string
  rating: string | null
  confidence: string | null
  source: 'paste' | 'openreview'
  noteId: string | null
  opening: string
}

export type RebuttalMeta = {
  schemaVersion: 1
  slug: string
  name: string
  venue: string
  forum: string | null
  limits: { replyChars: number; generalChars: number; pdfPages: number }
  reviewers: RebuttalReviewer[]
  general: { intro: string; closing: string }
  assembly: { shared: RebuttalSharedAnswerMode }
  createdAt: string
  updatedAt: string
}

export type RebuttalPoint = {
  id: string
  reviewer: string
  kind: RebuttalPointKind
  type: RebuttalPointType
  summary: string
  quote: string
  start: number
  end: number
  /** 1 is the original review; a higher round quotes that follow-up. */
  round: number
  origin: RebuttalPointOrigin
  /** The prediction this concern was turned from, when origin is prediction. */
  fromPrediction: string | null
}

export type RebuttalManuscriptLocation = {
  file: string
  line: number | null
  anchor: string | null
}

export type RebuttalCluster = {
  id: string
  title: string
  points: string[]
  action: RebuttalClusterAction
  status: RebuttalClusterStatus
  plan: string
  experiment: string | null
  manuscript: RebuttalManuscriptLocation | null
  response: string
  /** Who wrote the reply; null when it is empty or predates this field. */
  author: RebuttalReplyAuthor | null
  general: boolean
}

export type RebuttalPromise = {
  id: string
  text: string
  clusters: string[]
  done: boolean
  createdAt: string
}

/** One rebuttal's validated files, as the assembly functions read them. */
export type RebuttalBundle = {
  meta: RebuttalMeta
  points: RebuttalPoint[]
  clusters: RebuttalCluster[]
  promises: RebuttalPromise[]
}

export const REBUTTAL_SCHEMA_VERSION: 1
export const DEFAULT_REPLY_CHAR_LIMIT: number
export const REBUTTAL_GITIGNORE: string
export const POINT_KINDS: readonly RebuttalPointKind[]
export const POINT_ORIGINS: readonly RebuttalPointOrigin[]
export const POINT_TYPES: readonly RebuttalPointType[]
export const CLUSTER_ACTIONS: readonly RebuttalClusterAction[]
export const CLUSTER_STATUSES: readonly RebuttalClusterStatus[]
export const SHARED_ANSWER_MODES: readonly RebuttalSharedAnswerMode[]
export const MAX_REVIEW_CHARS: number
export const KIND_LETTER: Readonly<Record<RebuttalPointKind, 'W' | 'Q' | 'M'>>

export function rebuttalSlug(name: string): string
export function safeRebuttalSlug(value: unknown): string
export function safeReviewerId(value: unknown): string
export function pointLetter(kind: RebuttalPointKind): 'W' | 'Q' | 'M'
export function localPointLabel(pointId: string): string
export function reviewerSortKey(reviewerId: string): number
export function nextPointId(
  points: readonly { id: string }[],
  reviewerId: string,
  kind: RebuttalPointKind
): string
export function newRebuttalMeta(input: {
  name: string
  slug?: string
  venue?: string
  forum?: string | null
  replyChars?: number
  now: string
}): RebuttalMeta
/** Throws a HarnessError (code invalid_argument) on an invalid value. */
export function parseRebuttalMeta(value: unknown): RebuttalMeta
export function nextSequentialId(prefix: 'C' | 'P', items: readonly { id: string }[]): string
export function nextReviewerId(reviewers: readonly { id: string }[]): string
export function serializeRebuttalJson(value: unknown): string
export function pointsDocument(points: RebuttalPoint[]): {
  schemaVersion: 1
  points: RebuttalPoint[]
}
export function clustersDocument(clusters: RebuttalCluster[]): {
  schemaVersion: 1
  clusters: RebuttalCluster[]
}
export function promisesDocument(promises: RebuttalPromise[]): {
  schemaVersion: 1
  promises: RebuttalPromise[]
}
