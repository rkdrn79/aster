import type { RebuttalCluster, RebuttalPoint, RebuttalPromise } from './research-rebuttal-model.mjs'
import type {
  RebuttalPaperChange,
  RebuttalPrediction,
  RebuttalReplyProposal,
  RebuttalReplyVersion
} from './research-rebuttal-records.mjs'
import type { RebuttalTranslation } from './research-rebuttal-translations.mjs'

export type RebuttalArchivedGroup = {
  id: string
  /** The regroup that removed it, or null for a plain change. */
  regroup: string | null
  at: string
  cluster: RebuttalCluster
  /** Concerns that were deleted with it, put back on restore. */
  points: RebuttalPoint[]
  paperChanges: RebuttalPaperChange[]
}

export type RebuttalRegroupSummary = {
  merged: { into: string; from: string[]; joined: boolean }[]
  split: { from: string; into: string[] }[]
  removed: string[]
  moved: string[]
}

export type RebuttalRegroupInput = { clusters?: unknown[]; points?: unknown[] }

export type RebuttalRegroup = {
  id: string
  at: string
  turn: string | null
  request: string
  /** True once it changed the groups; false while it waits (Ask first, or held while typing). */
  applied: boolean
  heldWhileTyping?: boolean
  summary: RebuttalRegroupSummary
  affected: string[]
  before: {
    clusters: RebuttalCluster[]
    points: RebuttalPoint[] | null
    promises: RebuttalPromise[]
    paperChanges: RebuttalPaperChange[]
    predictions: Pick<RebuttalPrediction, 'id' | 'trigger'>[]
    proposals: RebuttalReplyProposal[]
    translations: RebuttalTranslation[]
  }
  after: { clusters: RebuttalCluster[]; points: RebuttalPoint[] | null }
  input: RebuttalRegroupInput
  supplied: Record<string, string>
}

export type RebuttalRegroupState = {
  clusters: RebuttalCluster[]
  points: RebuttalPoint[]
  promises: RebuttalPromise[]
  paperChanges: RebuttalPaperChange[]
  predictions: RebuttalPrediction[]
  proposals: RebuttalReplyProposal[]
  translations: RebuttalTranslation[]
  regroups: RebuttalRegroup[]
  archive: RebuttalArchivedGroup[]
}

export type RebuttalRegroupPlan = {
  clusters: RebuttalCluster[]
  points: RebuttalPoint[]
  promises: RebuttalPromise[]
  paperChanges: RebuttalPaperChange[]
  predictions: RebuttalPrediction[]
  proposals: RebuttalReplyProposal[]
  versions: (Pick<RebuttalReplyVersion, 'by' | 'what' | 'text'> & { slot: string })[]
  archive: Omit<RebuttalArchivedGroup, 'id' | 'regroup' | 'at'>[]
  summary: RebuttalRegroupSummary
  affected: string[]
  touchesWritten: boolean
}

export function clusterEntries(input: unknown): unknown[] | null
export function suppliedReplies(input: unknown): Map<string, string>
export function planRegroup(
  state: RebuttalRegroupState,
  change: { clusters?: unknown; points?: RebuttalPoint[]; supplied?: Map<string, string> }
): RebuttalRegroupPlan
export function regroupPhrases(summary: RebuttalRegroupSummary): string[]
