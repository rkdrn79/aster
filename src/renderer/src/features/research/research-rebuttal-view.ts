import type { RebuttalBundle } from '../../../../research-harness/research-rebuttal-model.mjs'
import {
  assembleAllReplies,
  clusterReviewers,
  planReviewerReplies
} from '../../../../research-harness/research-rebuttal-assemble.mjs'
import { predictionIsStale } from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalPrediction } from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

export type RebuttalAnswer = ReturnType<
  typeof planReviewerReplies
>['replies'][number]['answers'][number]

export function reviewerRounds(bundle: RebuttalBundle, reviewerId: string): number[] {
  const rounds = new Set([
    1,
    ...bundle.points.filter((point) => point.reviewer === reviewerId).map((point) => point.round)
  ])
  return [...rounds].sort((left, right) => left - right)
}

/** One reviewer's answers for one round, in review order. */
export function reviewerAnswers(
  bundle: RebuttalBundle,
  reviewerId: string,
  round: number
): RebuttalAnswer[] {
  return (
    planReviewerReplies(bundle, { round }).replies.find((reply) => reply.reviewer.id === reviewerId)
      ?.answers ?? []
  )
}

export type ReviewerProgress = {
  total: number
  drafted: number
  ready: number
  chars: number
  limit: number
  over: boolean
  waiting: number
  predictionsOpen: number
  predictionsStale: number
}

function answersOf(bundle: RebuttalBundle, reviewerId: string): RebuttalAnswer[] {
  return reviewerRounds(bundle, reviewerId).flatMap((round) =>
    reviewerAnswers(bundle, reviewerId, round)
  )
}

/** Where a reviewer stands: how many answers are written and ready, and how much of the limit. */
export function reviewerProgress(snapshot: RebuttalSnapshot, reviewerId: string): ReviewerProgress {
  const { bundle } = snapshot
  const answers = answersOf(bundle, reviewerId)
  const replies = assembleAllReplies(bundle).filter((reply) => reply.reviewer === reviewerId)
  const first = replies.find((reply) => reply.round === 1)
  const slots = new Set(answers.flatMap((answer) => (answer.cluster ? [answer.cluster.id] : [])))
  const open = snapshot.predictions.filter(
    (prediction) => prediction.reviewer === reviewerId && prediction.status === 'open'
  )
  return {
    total: answers.length,
    drafted: answers.filter((answer) => answer.cluster?.response.trim()).length,
    ready: answers.filter((answer) => answer.cluster?.status === 'done').length,
    chars: first?.chars ?? 0,
    limit: first?.limit ?? bundle.meta.limits.replyChars,
    over: replies.some((reply) => reply.over),
    waiting: snapshot.proposals.filter((proposal) => slots.has(proposal.slot)).length,
    predictionsOpen: open.length,
    predictionsStale: open.filter((prediction) => predictionIsStale(bundle, prediction)).length
  }
}

/** Other reviewers who raised the same concern as this answer. */
export function sharedWith(bundle: RebuttalBundle, answer: RebuttalAnswer, reviewerId: string) {
  if (!answer.cluster) {
    return []
  }
  const reviewers = clusterReviewers(bundle).get(answer.cluster.id) ?? []
  return reviewers.filter((id) => id !== reviewerId)
}

/** Open predictions that came from this reviewer, newest batch's items first by likelihood. */
export function openPredictions(
  snapshot: RebuttalSnapshot,
  reviewerId: string
): RebuttalPrediction[] {
  const weight = { high: 0, medium: 1, low: 2 }
  return snapshot.predictions
    .filter(
      (prediction) =>
        prediction.reviewer === reviewerId &&
        (prediction.status === 'open' || prediction.status === 'handed-off')
    )
    .sort((left, right) => weight[left.likelihood] - weight[right.likelihood])
}

export function historyTimeText(at: string, now = Date.now()): string {
  const when = new Date(at)
  if (Number.isNaN(when.getTime())) {
    return ''
  }
  const minutes = Math.round((now - when.getTime()) / 60_000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new Date(now).toDateString() === when.toDateString()
    ? time
    : `${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}
