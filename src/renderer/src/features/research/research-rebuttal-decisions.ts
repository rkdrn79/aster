import {
  nextPointId,
  clustersDocument,
  nextSequentialId,
  pointsDocument,
  type RebuttalPoint
} from '../../../../research-harness/research-rebuttal-model.mjs'
import {
  parseClusters,
  parsePoints
} from '../../../../research-harness/research-rebuttal-points.mjs'
import {
  followUpsDocument,
  nextFollowUpRound,
  parseFollowUps,
  predictionsDocument,
  type RebuttalPrediction,
  MAX_FOLLOW_UP_CHARS
} from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalOwner } from './research-rebuttal-files'
import { withFreshSnapshot, writeJson } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

/** A reviewer's later reply, kept as a new round on that reviewer. */
export async function addRebuttalFollowUp(
  owner: RebuttalOwner,
  input: { reviewerId: string; text: string; source?: 'paste' | 'openreview' }
): Promise<number> {
  const text = input.text.trim()
  if (!text) {
    throw new Error('Paste the follow-up first.')
  }
  if (text.length > MAX_FOLLOW_UP_CHARS) {
    throw new Error('A follow-up may be at most 200,000 characters.')
  }
  let round = 2
  await withFreshSnapshot(owner, async (snapshot) => {
    round = nextFollowUpRound(snapshot.followUps, input.reviewerId)
    const followUps = parseFollowUps(
      [
        ...snapshot.followUps,
        {
          reviewer: input.reviewerId,
          round,
          text,
          receivedAt: new Date().toISOString(),
          source: input.source ?? 'paste',
          noteId: null
        }
      ],
      { reviewers: snapshot.bundle.meta.reviewers }
    )
    await writeJson(
      snapshot,
      'followups.json',
      snapshot.texts.followUps,
      followUpsDocument(followUps)
    )
  })
  return round
}

function withPoint(snapshot: RebuttalSnapshot, point: RebuttalPoint): RebuttalPoint[] {
  return parsePoints([...snapshot.bundle.points, point], {
    reviewers: snapshot.bundle.meta.reviewers,
    reviews: snapshot.reviews,
    followUps: snapshot.followUps
  })
}

/** Adds a concern from a selected stretch of a review or follow-up. */
export async function addRebuttalConcern(
  owner: RebuttalOwner,
  input: {
    reviewerId: string
    round: number
    quote: string
    summary: string
    kind: 'weakness' | 'question' | 'minor'
  }
): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const points = withPoint(snapshot, {
      id: nextPointId(snapshot.bundle.points, input.reviewerId, input.kind),
      reviewer: input.reviewerId,
      kind: input.kind,
      type: 'other',
      summary: input.summary.trim(),
      quote: input.quote,
      start: 0,
      end: 0,
      round: input.round,
      origin: 'review',
      fromPrediction: null
    })
    await writeJson(snapshot, 'points.json', snapshot.texts.points, pointsDocument(points))
  })
}

function replacePrediction(
  snapshot: RebuttalSnapshot,
  id: string,
  change: (prediction: RebuttalPrediction) => RebuttalPrediction
): RebuttalPrediction[] {
  return snapshot.predictions.map((entry) => (entry.id === id ? change(entry) : entry))
}

function writePredictions(
  snapshot: RebuttalSnapshot,
  predictions: RebuttalPrediction[]
): Promise<void> {
  return writeJson(
    snapshot,
    'predictions.json',
    snapshot.texts.predictions,
    predictionsDocument({ predictions, outlooks: snapshot.outlooks })
  )
}

export async function dismissRebuttalPrediction(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    await writePredictions(
      snapshot,
      replacePrediction(snapshot, id, (entry) => ({ ...entry, status: 'dismissed' }))
    )
  })
}

/** The prediction becomes a concern to answer; it gets its own group and reply. */
export async function convertRebuttalPrediction(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const prediction = snapshot.predictions.find((entry) => entry.id === id)
    if (!prediction) {
      return
    }
    const pointId = nextPointId(snapshot.bundle.points, prediction.reviewer, 'weakness')
    const round = Math.max(
      1,
      ...snapshot.bundle.points
        .filter((point) => point.reviewer === prediction.reviewer)
        .map((point) => point.round)
    )
    const points = withPoint(snapshot, {
      id: pointId,
      reviewer: prediction.reviewer,
      kind: 'weakness',
      type: 'other',
      summary: prediction.concern.slice(0, 400),
      quote: '',
      start: 0,
      end: 0,
      round,
      origin: 'prediction',
      fromPrediction: prediction.id
    })
    const clusters = parseClusters(
      [
        ...snapshot.bundle.clusters,
        {
          id: nextSequentialId('C', snapshot.bundle.clusters),
          title: prediction.concern.slice(0, 200),
          points: [pointId],
          action: 'clarify' as const,
          status: 'todo' as const,
          plan: prediction.preempt,
          experiment: null,
          manuscript: null,
          response: '',
          author: null,
          general: false
        }
      ],
      { pointIds: points.map((point) => point.id) }
    )
    await writeJson(snapshot, 'points.json', snapshot.texts.points, pointsDocument(points))
    await writeJson(snapshot, 'clusters.json', snapshot.texts.clusters, clustersDocument(clusters))
    await writePredictions(
      snapshot,
      replacePrediction(snapshot, id, (entry) => ({
        ...entry,
        status: 'converted',
        convertedTo: pointId
      }))
    )
  })
}

export async function markPredictionHandedOff(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    await writePredictions(
      snapshot,
      replacePrediction(snapshot, id, (entry) => ({ ...entry, status: 'handed-off' }))
    )
  })
}
