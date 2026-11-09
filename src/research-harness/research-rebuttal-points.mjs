import {
  invalid,
  isObject,
  integer,
  list,
  nullableText,
  oneOf,
  text,
  uniqueIds
} from './research-rebuttal-fields.mjs'
import {
  CLUSTER_ACTIONS,
  CLUSTER_STATUSES,
  KIND_LETTER,
  POINT_KINDS,
  POINT_TYPES,
  reviewerSortKey
} from './research-rebuttal-model.mjs'

const POINT_ID = /^(R[1-9][0-9]?)-([WQM])([1-9][0-9]{0,2})$/
const CLUSTER_ID = /^C[1-9][0-9]{0,2}$/
const PROMISE_ID = /^P[1-9][0-9]{0,2}$/

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tolerantChar(char) {
  if (/["“”„]/u.test(char)) {
    return '["“”„]'
  }
  if (/['‘’`]/u.test(char)) {
    return "['‘’`]"
  }
  if (/[-‐‑–—]/u.test(char)) {
    return '[-‐‑–—]'
  }
  return escapeRegExp(char)
}

/**
 * Where `quote` sits in `review`, preferring the stated offsets, then the occurrence nearest to
 * them, then a match that ignores whitespace runs and typographic quotes or dashes.
 */
export function locateQuote(review, quote, hint = {}) {
  const wanted = quote.trim()
  if (!wanted) {
    return null
  }
  const { start, end } = hint
  if (Number.isInteger(start) && Number.isInteger(end) && review.slice(start, end) === quote) {
    return { start, end }
  }
  const matches = []
  for (
    let index = review.indexOf(wanted);
    index !== -1;
    index = review.indexOf(wanted, index + 1)
  ) {
    matches.push({ start: index, end: index + wanted.length })
  }
  if (matches.length === 0) {
    const pattern = wanted
      .split(/\s+/u)
      .map((word) => Array.from(word, tolerantChar).join(''))
      .join('\\s+')
    for (const match of review.matchAll(new RegExp(pattern, 'gu'))) {
      matches.push({ start: match.index, end: match.index + match[0].length })
    }
  }
  if (matches.length === 0) {
    return null
  }
  const anchor = Number.isInteger(start) ? start : 0
  return matches.reduce((best, match) =>
    Math.abs(match.start - anchor) < Math.abs(best.start - anchor) ? match : best
  )
}

/** Validates points against the reviewers and their review texts; quotes get exact offsets. */
export function parsePoints(value, { reviewers, reviews }) {
  const known = new Set(reviewers.map((reviewer) => reviewer.id))
  const points = list(value, 'points', 'points').map((entry, index) => {
    if (!isObject(entry)) {
      throw invalid(`points[${index}] must be an object`)
    }
    const match = typeof entry.id === 'string' ? POINT_ID.exec(entry.id) : null
    if (!match) {
      throw invalid(`Point ID must look like R1-W2, R3-Q1 or R2-M1, got: ${String(entry.id)}`)
    }
    const reviewer = entry.reviewer ?? match[1]
    if (reviewer !== match[1] || !known.has(reviewer)) {
      throw invalid(`${entry.id}: reviewer ${String(reviewer)} has no review in this rebuttal`)
    }
    const kind = oneOf(entry.kind, `${entry.id} kind`, POINT_KINDS)
    if (KIND_LETTER[kind] !== match[2]) {
      throw invalid(`${entry.id}: a ${kind} point ID uses the letter ${KIND_LETTER[kind]}`)
    }
    const quote = text(entry.quote, `${entry.id} quote`, { max: 4000, required: true })
    const located = locateQuote(reviews[reviewer] ?? '', quote, entry)
    if (!located) {
      throw invalid(`${entry.id}: the quote was not found in ${reviewer}'s review text`)
    }
    return {
      ...entry,
      id: entry.id,
      reviewer,
      kind,
      type: oneOf(entry.type, `${entry.id} type`, POINT_TYPES, 'other'),
      summary: text(entry.summary, `${entry.id} summary`, { max: 400 }),
      quote: (reviews[reviewer] ?? '').slice(located.start, located.end),
      start: located.start,
      end: located.end
    }
  })
  uniqueIds(points, 'point')
  return points.sort(
    (left, right) =>
      reviewerSortKey(left.reviewer) - reviewerSortKey(right.reviewer) || left.start - right.start
  )
}

function manuscriptLocation(value, label) {
  if (value === undefined || value === null) {
    return null
  }
  if (!isObject(value)) {
    throw invalid(`${label} must be an object with file, line and anchor`)
  }
  const file = text(value.file, `${label}.file`, { max: 1024, required: true })
  if (file.startsWith('/') || /^[A-Za-z]:/.test(file) || file.split(/[\\/]/).includes('..')) {
    throw invalid(`${label}.file must be a project-relative path`)
  }
  return {
    file,
    line: integer(value.line, `${label}.line`, { min: 1, max: 1_000_000, fallback: null }),
    anchor: nullableText(value.anchor, `${label}.anchor`, 400)
  }
}

/** Each point belongs to at most one cluster; previous drafts survive a regroup by cluster ID. */
export function parseClusters(value, { pointIds, previous = [] }) {
  const known = new Set(pointIds)
  const drafts = new Map(previous.map((cluster) => [cluster.id, cluster]))
  const owner = new Map()
  const clusters = list(value, 'clusters', 'clusters').map((entry, index) => {
    if (!isObject(entry)) {
      throw invalid(`clusters[${index}] must be an object`)
    }
    if (typeof entry.id !== 'string' || !CLUSTER_ID.test(entry.id)) {
      throw invalid(`Cluster ID must look like C1 … C999, got: ${String(entry.id)}`)
    }
    const points = Array.isArray(entry.points) ? entry.points : []
    if (points.length === 0) {
      throw invalid(`${entry.id}: list at least one point ID in "points"`)
    }
    for (const pointId of points) {
      if (!known.has(pointId)) {
        throw invalid(`${entry.id}: unknown point ${String(pointId)}`)
      }
      if (owner.has(pointId)) {
        throw invalid(`${pointId} is in both ${owner.get(pointId)} and ${entry.id}`)
      }
      owner.set(pointId, entry.id)
    }
    const earlier = drafts.get(entry.id)
    return {
      ...entry,
      id: entry.id,
      title: text(entry.title, `${entry.id} title`, { max: 200, required: true }),
      points,
      action: oneOf(entry.action, `${entry.id} action`, CLUSTER_ACTIONS),
      status: oneOf(
        entry.status,
        `${entry.id} status`,
        CLUSTER_STATUSES,
        earlier?.status ?? 'todo'
      ),
      plan: text(entry.plan, `${entry.id} plan`, { max: 4000 }),
      experiment: nullableText(
        entry.experiment ?? earlier?.experiment,
        `${entry.id} experiment`,
        200
      ),
      manuscript: manuscriptLocation(
        entry.manuscript === undefined ? earlier?.manuscript : entry.manuscript,
        `${entry.id} manuscript`
      ),
      response: text(entry.response ?? earlier?.response, `${entry.id} response`, { max: 30_000 }),
      general: entry.general === undefined ? Boolean(earlier?.general) : entry.general === true
    }
  })
  uniqueIds(clusters, 'cluster')
  return clusters.sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)))
}

export function parsePromises(value, { clusterIds }) {
  const known = new Set(clusterIds)
  const promises = list(value, 'promises', 'promises').map((entry, index) => {
    if (!isObject(entry)) {
      throw invalid(`promises[${index}] must be an object`)
    }
    if (typeof entry.id !== 'string' || !PROMISE_ID.test(entry.id)) {
      throw invalid(`Promise ID must look like P1 … P999, got: ${String(entry.id)}`)
    }
    const clusters = Array.isArray(entry.clusters) ? entry.clusters : []
    for (const clusterId of clusters) {
      if (!known.has(clusterId)) {
        throw invalid(`${entry.id}: unknown cluster ${String(clusterId)}`)
      }
    }
    return {
      ...entry,
      id: entry.id,
      text: text(entry.text, `${entry.id} text`, { max: 1000, required: true }),
      clusters,
      done: entry.done === true,
      createdAt: text(entry.createdAt, `${entry.id} createdAt`, { max: 64 })
    }
  })
  uniqueIds(promises, 'promise')
  return promises
}
