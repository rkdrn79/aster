import type { RebuttalPoint } from '../../../../research-harness/research-rebuttal-model.mjs'

export type ReviewSegment = {
  start: number
  end: number
  text: string
  /** Points whose quote covers this stretch; empty for plain text. */
  points: RebuttalPoint[]
  /** Points whose quote begins here, so their label is drawn before the text. */
  starting: RebuttalPoint[]
}

/** Splits a review at every quote boundary, so overlapping quotes still highlight correctly. */
export function reviewSegments(text: string, points: readonly RebuttalPoint[]): ReviewSegment[] {
  const inside = points.filter((point) => point.start < point.end && point.end <= text.length)
  const cuts = new Set([0, text.length])
  for (const point of inside) {
    cuts.add(point.start)
    cuts.add(point.end)
  }
  const sorted = [...cuts].sort((left, right) => left - right)
  const segments: ReviewSegment[] = []
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]
    const end = sorted[index + 1]
    if (start === end) {
      continue
    }
    segments.push({
      start,
      end,
      text: text.slice(start, end),
      points: inside.filter((point) => point.start <= start && point.end >= end),
      starting: inside.filter((point) => point.start === start)
    })
  }
  return segments
}

export const POINT_KIND_LABELS = {
  weakness: 'Weakness',
  question: 'Question',
  minor: 'Minor'
} as const

export const POINT_TYPE_LABELS: Record<RebuttalPoint['type'], string> = {
  'experiment-request': 'Experiment request',
  clarity: 'Clarity',
  'related-work': 'Related work',
  novelty: 'Novelty',
  soundness: 'Soundness',
  reproducibility: 'Reproducibility',
  presentation: 'Presentation',
  typo: 'Typo',
  other: 'Other'
}
