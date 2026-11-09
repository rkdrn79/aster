import type {
  RebuttalBundle,
  RebuttalCluster,
  RebuttalReviewer,
  RebuttalSharedAnswerMode
} from './research-rebuttal-model.mjs'

export type RebuttalReviewerReply = {
  reviewer: string
  name: string
  text: string
  chars: number
  limit: number
  over: boolean
  /** Point IDs whose answer is not drafted yet. */
  missing: string[]
  answers: { label: string; cluster: string | null; points: string[] }[]
}

export type RebuttalGeneralResponse = {
  text: string
  chars: number
  limit: number
  over: boolean
  missing: string[]
}

export type RebuttalReadiness = {
  unclustered: string[]
  undrafted: string[]
  overLimit: string[]
  replies: { reviewer: string; chars: number; limit: number; over: boolean }[]
  general: { chars: number; limit: number; over: boolean }
}

export function replyCharCount(value: string): number
export function reviewerDisplayName(reviewer: Pick<RebuttalReviewer, 'id' | 'label'>): string
export function sharedClusters(
  bundle: RebuttalBundle
): { cluster: RebuttalCluster; label: string }[]
export function clusterReviewers(bundle: RebuttalBundle): Map<string, string[]>
export function assembleReviewerReplies(
  bundle: RebuttalBundle,
  options?: { shared?: RebuttalSharedAnswerMode }
): RebuttalReviewerReply[]
export function assembleGeneralResponse(bundle: RebuttalBundle): RebuttalGeneralResponse
export function rebuttalReadiness(bundle: RebuttalBundle): RebuttalReadiness
