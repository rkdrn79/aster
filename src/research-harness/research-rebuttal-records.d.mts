import type {
  RebuttalBundle,
  RebuttalReplyAuthor,
  RebuttalReviewer
} from './research-rebuttal-model.mjs'

export type RebuttalFollowUp = {
  id: string
  reviewer: string
  round: number
  text: string
  receivedAt: string
  source: 'paste' | 'openreview'
  noteId: string | null
}

export type RebuttalReplyProposal = {
  id: string
  slot: string
  kind: 'replace' | 'passage'
  /** True when the text went straight into the reply; `base` is what Undo puts back. */
  applied: boolean
  /** Set when the agent's text landed while the person was typing, so it waits instead. */
  heldWhileTyping?: boolean
  base: string
  text: string
  find: string | null
  replace: string | null
  turn: string | null
  request: string
  at: string
}

export type RebuttalPredictionLikelihood = 'low' | 'medium' | 'high'
export type RebuttalPredictionStatus = 'open' | 'dismissed' | 'converted' | 'handed-off'
export type RebuttalPredictionTrigger = {
  cluster: string | null
  point: string | null
  quote: string | null
}

export type RebuttalPrediction = {
  id: string
  reviewer: string
  concern: string
  why: string
  likelihood: RebuttalPredictionLikelihood
  trigger: RebuttalPredictionTrigger
  preempt: string
  status: RebuttalPredictionStatus
  /** Hash of the reply it was made against; a different current reply marks it stale. */
  basis: string
  predictedAt: string
  convertedTo: string | null
}

export type RebuttalOutlook = {
  reviewer: string
  direction: 'up' | 'same' | 'down'
  note: string
  basis: string
  at: string
}

export type RebuttalPaperChange = {
  id: string
  cluster: string
  promise: string | null
  file: string
  find: string
  replace: string
  why: string
  status: 'pending' | 'applied' | 'rejected'
  at: string
  decidedAt: string | null
}

export type RebuttalReplyVersion = {
  id: string
  at: string
  by: 'human' | 'agent'
  what: string
  text: string
  turn: string | null
}

export type RebuttalProposalOutcome =
  | { mode: 'clean' | 'overwrites'; text: string }
  | { mode: 'conflict'; text: null }

export const REPLY_AUTHORS: readonly RebuttalReplyAuthor[]
export const PREDICTION_LIKELIHOODS: readonly RebuttalPredictionLikelihood[]
export const PREDICTION_STATUSES: readonly RebuttalPredictionStatus[]
export const OUTLOOK_DIRECTIONS: readonly ('up' | 'same' | 'down')[]
export const PAPER_CHANGE_STATUSES: readonly ('pending' | 'applied' | 'rejected')[]
export const FOLLOW_UP_SOURCES: readonly ('paste' | 'openreview')[]
export const MAX_REPLY_CHARS: number
export const MAX_FOLLOW_UP_CHARS: number

export function safeSlot(value: unknown): string
export function slotFor(target: { cluster?: string; opening?: string; general?: string }): string
export function historyFileName(slot: string): string
export function slotText(bundle: RebuttalBundle, slot: string): string | null
export function replyHash(value: string): string
export function parseFollowUps(
  value: unknown,
  context: { reviewers: readonly RebuttalReviewer[] }
): RebuttalFollowUp[]
export function nextFollowUpRound(
  followUps: readonly RebuttalFollowUp[],
  reviewerId: string
): number
export function followUpsDocument(followUps: RebuttalFollowUp[]): {
  schemaVersion: 1
  followUps: RebuttalFollowUp[]
}
export function parseProposals(value: unknown): RebuttalReplyProposal[]
export function proposalsDocument(proposals: RebuttalReplyProposal[]): {
  schemaVersion: 1
  proposals: RebuttalReplyProposal[]
}
export function withProposal(
  proposals: RebuttalReplyProposal[],
  proposal: Omit<
    RebuttalReplyProposal,
    'id' | 'kind' | 'turn' | 'request' | 'base' | 'find' | 'replace'
  > &
    Partial<Pick<RebuttalReplyProposal, 'turn' | 'request' | 'base' | 'find' | 'replace' | 'kind'>>
): { proposals: RebuttalReplyProposal[]; superseded: RebuttalReplyProposal[] }
export function proposalOutcome(
  current: string,
  proposal: RebuttalReplyProposal
): RebuttalProposalOutcome
export function replyAuthorAfterAccept(previous: RebuttalReplyAuthor | null): RebuttalReplyAuthor
export function replyAuthorAfterHumanEdit(
  author: RebuttalReplyAuthor | null,
  previousText: string,
  nextText: string
): RebuttalReplyAuthor | null
export function parseHistory(value: unknown): RebuttalReplyVersion[]
export function appendVersion(
  versions: RebuttalReplyVersion[],
  entry: Omit<RebuttalReplyVersion, 'id' | 'turn'> & { turn?: string | null }
): RebuttalReplyVersion[]
export function historyDocument(versions: RebuttalReplyVersion[]): {
  schemaVersion: 1
  versions: RebuttalReplyVersion[]
}
export function parsePredictions(
  value: unknown,
  context?: { reviewers?: readonly RebuttalReviewer[]; clusterIds?: readonly string[] }
): { predictions: RebuttalPrediction[]; outlooks: RebuttalOutlook[] }
export function predictionsDocument(input: {
  predictions: RebuttalPrediction[]
  outlooks: RebuttalOutlook[]
}): { schemaVersion: 1; predictions: RebuttalPrediction[]; outlooks: RebuttalOutlook[] }
export function predictionBasis(bundle: RebuttalBundle, prediction: RebuttalPrediction): string
export function predictionIsStale(bundle: RebuttalBundle, prediction: RebuttalPrediction): boolean
export function reviewerRepliesBasis(bundle: RebuttalBundle, reviewerId: string): string
export function parsePaperChanges(
  value: unknown,
  context?: { clusterIds?: readonly string[] }
): RebuttalPaperChange[]
export function paperChangesDocument(changes: RebuttalPaperChange[]): {
  schemaVersion: 1
  changes: RebuttalPaperChange[]
}
export function locatePaperChange(
  source: string,
  find: string
): { start: number; end: number; error?: undefined } | { error: string }
export function nextPaperChangeId(changes: readonly RebuttalPaperChange[]): string
