import type {
  RebuttalCluster,
  RebuttalPoint,
  RebuttalPromise,
  RebuttalReviewer
} from './research-rebuttal-model.mjs'

export function locateQuote(
  review: string,
  quote: string,
  hint?: { start?: unknown; end?: unknown }
): { start: number; end: number } | null

/** Throws a HarnessError on an invalid point; quotes get exact offsets in their review. */
export function parsePoints(
  value: unknown,
  context: {
    reviewers: readonly RebuttalReviewer[]
    reviews: Readonly<Record<string, string>>
    followUps?: readonly { reviewer: string; round: number; text: string }[]
  }
): RebuttalPoint[]

export function parseClusters(
  value: unknown,
  context: { pointIds: readonly string[]; previous?: readonly RebuttalCluster[] }
): RebuttalCluster[]

export function parsePromises(
  value: unknown,
  context: { clusterIds: readonly string[] }
): RebuttalPromise[]
