import { localPointLabel } from './research-rebuttal-model.mjs'

// Why .length: OpenReview checks a reply's length in UTF-16 units, which never undercounts.
export function replyCharCount(value) {
  return value.length
}

export function reviewerDisplayName(reviewer) {
  const label = reviewer.label?.trim()
  return label ? label : reviewer.id
}

/** Shared clusters: raised by two or more reviewers, or marked for the general response. */
export function sharedClusters(bundle) {
  const reviewersOf = clusterReviewers(bundle)
  return bundle.clusters
    .filter((cluster) => cluster.general || (reviewersOf.get(cluster.id)?.length ?? 0) > 1)
    .map((cluster, index) => ({ cluster, label: `G${index + 1}` }))
}

export function clusterReviewers(bundle) {
  const reviewerOf = new Map(bundle.points.map((point) => [point.id, point.reviewer]))
  return new Map(
    bundle.clusters.map((cluster) => [
      cluster.id,
      [...new Set(cluster.points.map((id) => reviewerOf.get(id)).filter(Boolean))].sort(
        (left, right) => Number(left.slice(1)) - Number(right.slice(1))
      )
    ])
  )
}

/**
 * Each reviewer's answers in review order: points of one cluster share an answer (A1, A2…), and
 * a cluster's full answer lives with the first reviewer who raised it.
 */
export function planReviewerReplies(bundle, { round = 1 } = {}) {
  const clusterOf = new Map()
  for (const cluster of bundle.clusters) {
    for (const pointId of cluster.points) {
      clusterOf.set(pointId, cluster)
    }
  }
  const replies = bundle.meta.reviewers.map((reviewer) => {
    const answers = []
    const byCluster = new Map()
    for (const point of bundle.points.filter(
      (entry) => entry.reviewer === reviewer.id && (entry.round ?? 1) === round
    )) {
      const cluster = clusterOf.get(point.id) ?? null
      const existing = cluster ? byCluster.get(cluster.id) : undefined
      if (existing) {
        existing.points.push(point)
        continue
      }
      const answer = { label: `A${answers.length + 1}`, cluster, points: [point] }
      answers.push(answer)
      if (cluster) {
        byCluster.set(cluster.id, answer)
      }
    }
    return { reviewer, answers }
  })
  const home = new Map()
  for (const reply of replies) {
    for (const answer of reply.answers) {
      if (answer.cluster && !home.has(answer.cluster.id)) {
        home.set(answer.cluster.id, { reviewer: reply.reviewer, label: answer.label })
      }
    }
  }
  return { replies, home }
}

function answerBody(answer, reviewer, { home, general, shared, missing }) {
  const { cluster } = answer
  if (!cluster) {
    missing.push(...answer.points.map((point) => point.id))
    return `[No response yet: ${answer.points.map((point) => point.summary || point.id).join('; ')}]`
  }
  const generalLabel = general.get(cluster.id)
  if (shared === 'general' && generalLabel) {
    return `Please see our general response (${generalLabel}).`
  }
  const first = home.get(cluster.id)
  if (shared === 'reviewer' && first && first.reviewer.id !== reviewer.id) {
    return `Please see our response to ${reviewerDisplayName(first.reviewer)} (${first.label}).`
  }
  if (!cluster.response.trim()) {
    missing.push(...answer.points.map((point) => point.id))
    return `[Response for ${cluster.id} is not drafted yet.]`
  }
  return cluster.response.trim()
}

/**
 * The OpenReview reply to each reviewer with its character count against the venue limit.
 * `shared`: where an answer several reviewers share is written in full — with the first
 * reviewer who raised it ("reviewer"), in the general response ("general"), or everywhere ("repeat").
 */
export function assembleReviewerReplies(
  bundle,
  { shared = bundle.meta.assembly?.shared, round = 1 } = {}
) {
  const mode = shared === 'general' || shared === 'repeat' ? shared : 'reviewer'
  const { replies, home } = planReviewerReplies(bundle, { round })
  const general = new Map(sharedClusters(bundle).map(({ cluster, label }) => [cluster.id, label]))
  const limit = bundle.meta.limits.replyChars
  return replies.map(({ reviewer, answers }) => {
    const missing = []
    const blocks = answers.map((answer) => {
      const labels = answer.points
        .map((point) => (point.origin === 'prediction' ? 'anticipated' : localPointLabel(point.id)))
        .join(', ')
      const title = answer.cluster ? `: ${answer.cluster.title}` : ''
      const body = answerBody(answer, reviewer, { home, general, shared: mode, missing })
      return `**${answer.label} (${labels})${title}**\n${body}`
    })
    const opening = reviewer.opening?.trim()
    const text = [...(opening ? [opening] : []), ...blocks].join('\n\n')
    const chars = replyCharCount(text)
    return {
      reviewer: reviewer.id,
      name: reviewerDisplayName(reviewer),
      round,
      text,
      chars,
      limit,
      over: chars > limit,
      missing,
      answers: answers.map((answer) => ({
        label: answer.label,
        cluster: answer.cluster?.id ?? null,
        points: answer.points.map((point) => point.id)
      }))
    }
  })
}

/** Every reply to send: round 1 to each reviewer, then one per later round with concerns. */
export function assembleAllReplies(bundle, options) {
  const later = [
    ...new Set(bundle.points.map((point) => point.round ?? 1).filter((r) => r > 1))
  ].sort((left, right) => left - right)
  const first = assembleReviewerReplies(bundle, { ...options, round: 1 })
  const hasRound = (reply) => reply.answers.length > 0
  return [
    ...first,
    ...later.flatMap((round) =>
      assembleReviewerReplies(bundle, { ...options, round }).filter(hasRound)
    )
  ]
}

export function reviewerReplyFileName(reply) {
  return reply.round > 1
    ? `reviewer-${reply.reviewer}-round-${reply.round}.md`
    : `reviewer-${reply.reviewer}.md`
}

export function assembleGeneralResponse(bundle) {
  const reviewersOf = clusterReviewers(bundle)
  const missing = []
  const blocks = sharedClusters(bundle).map(({ cluster, label }) => {
    const raisedBy = (reviewersOf.get(cluster.id) ?? []).join(', ')
    const body = cluster.response.trim()
    if (!body) {
      missing.push(cluster.id)
    }
    return `**${label}: ${cluster.title}**${raisedBy ? ` (${raisedBy})` : ''}\n${body || `[Response for ${cluster.id} is not drafted yet.]`}`
  })
  const promises = bundle.promises.map((promise) => `- ${promise.text.trim()}`)
  const text = [
    bundle.meta.general.intro.trim(),
    ...blocks,
    promises.length ? `**Changes for the final version**\n${promises.join('\n')}` : '',
    bundle.meta.general.closing.trim()
  ]
    .filter(Boolean)
    .join('\n\n')
  const chars = replyCharCount(text)
  const limit = bundle.meta.limits.generalChars
  return { text, chars, limit, over: chars > limit, missing }
}

/** What still blocks posting: points without a cluster, empty drafts, and replies over the limit. */
export function rebuttalReadiness(bundle) {
  const clustered = new Set(bundle.clusters.flatMap((cluster) => cluster.points))
  const replies = assembleAllReplies(bundle)
  const general = assembleGeneralResponse(bundle)
  return {
    unclustered: bundle.points.filter((point) => !clustered.has(point.id)).map((point) => point.id),
    undrafted: bundle.clusters.filter((cluster) => !cluster.response.trim()).map((c) => c.id),
    overLimit: [
      ...replies.filter((reply) => reply.over).map((reply) => reply.reviewer),
      ...(general.over ? ['general'] : [])
    ],
    replies: replies.map(({ reviewer, round, chars, limit, over }) => ({
      reviewer,
      round,
      chars,
      limit,
      over
    })),
    general: { chars: general.chars, limit: general.limit, over: general.over }
  }
}
