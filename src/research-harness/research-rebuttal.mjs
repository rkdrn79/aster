import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  assembleAllReplies,
  assembleGeneralResponse,
  rebuttalReadiness,
  reviewerReplyFileName
} from './research-rebuttal-assemble.mjs'
import {
  loadRebuttal,
  projectRelative,
  updateRebuttal,
  writeTextAtomically
} from './research-rebuttal-files.mjs'
import { assembleRebuttalLatex } from './research-rebuttal-latex.mjs'
import {
  MAX_REVIEW_CHARS,
  SHARED_ANSWER_MODES,
  clustersDocument,
  nextReviewerId,
  nextSequentialId,
  parseRebuttalMeta,
  pointsDocument,
  promisesDocument,
  safeReviewerId
} from './research-rebuttal-model.mjs'
import { parseClusters, parsePoints, parsePromises } from './research-rebuttal-points.mjs'

export {
  createRebuttal,
  listRebuttals,
  loadRebuttal,
  rebuttalRoot,
  resolveRebuttalSlug
} from './research-rebuttal-files.mjs'
export * from './research-rebuttal-replies.mjs'
export { listTranslations, setTranslations } from './research-rebuttal-translate.mjs'

export async function addReview(project, slug, input) {
  if (typeof input.text !== 'string' || !input.text.trim()) {
    throw new HarnessError('invalid_argument', 'The review text is empty.')
  }
  if (input.text.length > MAX_REVIEW_CHARS) {
    throw new HarnessError(
      'invalid_argument',
      `A review may be at most ${MAX_REVIEW_CHARS} characters.`
    )
  }
  return updateRebuttal(project, slug, async (bundle) => {
    const id = input.reviewer
      ? safeReviewerId(input.reviewer)
      : nextReviewerId(bundle.meta.reviewers)
    const reviews = { ...bundle.reviews, [id]: input.text }
    const existing = bundle.meta.reviewers.find((reviewer) => reviewer.id === id)
    const reviewer = {
      ...existing,
      id,
      label: input.label ?? existing?.label ?? '',
      rating: input.rating ?? existing?.rating ?? null,
      confidence: input.confidence ?? existing?.confidence ?? null,
      source: input.source ?? existing?.source ?? 'paste',
      noteId: input.noteId ?? existing?.noteId ?? null
    }
    const meta = parseRebuttalMeta({
      ...bundle.meta,
      reviewers: [...bundle.meta.reviewers.filter((entry) => entry.id !== id), reviewer],
      updatedAt: new Date().toISOString()
    })
    // Why: replacing a review moves its quotes; points that no longer match must be redone.
    const ownPoints = bundle.points.filter((point) => point.reviewer === id)
    const stale = ownPoints.filter((point) => {
      try {
        parsePoints([point], { reviewers: meta.reviewers, reviews, followUps: bundle.followUps })
        return false
      } catch {
        return true
      }
    })
    if (stale.length && !input.force) {
      throw new HarnessError(
        'conflict',
        `The new text no longer contains the quotes of ${stale.map((point) => point.id).join(', ')}. Pass --force to drop those points.`
      )
    }
    await mkdir(bundle.files.reviews, { recursive: true })
    await writeTextAtomically(path.join(bundle.files.reviews, `${id}.md`), input.text)
    const dropped = await savePoints(
      bundle,
      meta,
      reviews,
      bundle.points.filter((p) => !stale.includes(p))
    )
    await writeJsonAtomically(bundle.files.meta, meta)
    return {
      reviewer,
      path: projectRelative(project, path.join(bundle.files.reviews, `${id}.md`)),
      droppedPoints: stale.map((point) => point.id),
      ...dropped
    }
  })
}

/** Writes points, and removes points that left from clusters (dropping clusters left empty). */
async function savePoints(bundle, meta, reviews, nextPoints) {
  const points = parsePoints(nextPoints, {
    reviewers: meta.reviewers,
    reviews,
    followUps: bundle.followUps
  })
  const ids = new Set(points.map((point) => point.id))
  const droppedFromClusters = []
  const clusters = bundle.clusters.flatMap((cluster) => {
    const kept = cluster.points.filter((id) => ids.has(id))
    droppedFromClusters.push(...cluster.points.filter((id) => !ids.has(id)))
    return kept.length ? [{ ...cluster, points: kept }] : []
  })
  const removedClusters = bundle.clusters
    .filter((cluster) => !clusters.some((entry) => entry.id === cluster.id))
    .map((cluster) => cluster.id)
  await writeJsonAtomically(bundle.files.points, pointsDocument(points))
  if (droppedFromClusters.length) {
    await saveClusters(bundle, clusters)
  }
  return { points, droppedFromClusters, removedClusters }
}

async function saveClusters(bundle, clusters) {
  const ids = new Set(clusters.map((cluster) => cluster.id))
  await writeJsonAtomically(bundle.files.clusters, clustersDocument(clusters))
  if (bundle.promises.some((promise) => promise.clusters.some((id) => !ids.has(id)))) {
    const promises = bundle.promises.map((promise) => ({
      ...promise,
      clusters: promise.clusters.filter((id) => ids.has(id))
    }))
    await writeJsonAtomically(bundle.files.promises, promisesDocument(promises))
  }
}

export function setPoints(project, slug, input, { reviewer } = {}) {
  return updateRebuttal(project, slug, async (bundle) => {
    const incoming = Array.isArray(input) ? input : (input?.points ?? input)
    if (!Array.isArray(incoming)) {
      throw new HarnessError('invalid_argument', 'Points must be a JSON array or {"points": [...]}')
    }
    let next = incoming
    if (reviewer) {
      const id = safeReviewerId(reviewer)
      const foreign = incoming.find((point) => !String(point?.id ?? '').startsWith(`${id}-`))
      if (foreign) {
        throw new HarnessError(
          'invalid_argument',
          `--reviewer ${id} got a point of another reviewer: ${String(foreign.id)}`
        )
      }
      next = [...bundle.points.filter((point) => point.reviewer !== id), ...incoming]
    }
    const keptPoints = new Set(next.map((point) => point.id))
    refuseLosingWrittenReply(
      bundle,
      new Set(bundle.clusters.map((cluster) => cluster.id)),
      keptPoints
    )
    return savePoints(bundle, bundle.meta, bundle.reviews, next)
  })
}

export async function listPoints(project, slug, { reviewer } = {}) {
  const bundle = await loadRebuttal(project, slug)
  const clusterOf = new Map(bundle.clusters.flatMap((c) => c.points.map((id) => [id, c.id])))
  return {
    points: bundle.points
      .filter((point) => !reviewer || point.reviewer === reviewer)
      .map((point) => ({ ...point, cluster: clusterOf.get(point.id) ?? null }))
  }
}

/** A cluster's reply stays with its cluster: this command changes grouping, never written text. */
function withoutReplyText(input, bundle) {
  const entries = Array.isArray(input)
    ? input
    : Array.isArray(input?.clusters)
      ? input.clusters
      : null
  if (!entries) {
    return input
  }
  const written = new Set(bundle.clusters.filter((c) => c.response.trim()).map((c) => c.id))
  const stripped = entries.map((entry) => {
    if (!entry || typeof entry !== 'object' || !written.has(entry.id)) {
      return entry?.response && entry.author === undefined ? { ...entry, author: 'agent' } : entry
    }
    const { response: _response, author: _author, ...rest } = entry
    return rest
  })
  return Array.isArray(input) ? stripped : { ...input, clusters: stripped }
}

function refuseLosingWrittenReply(bundle, keptClusterIds, keptPointIds) {
  const lost = bundle.clusters.filter(
    (cluster) =>
      cluster.response.trim() &&
      (!keptClusterIds.has(cluster.id) || cluster.points.every((id) => !keptPointIds.has(id)))
  )
  if (lost.length) {
    throw new HarnessError(
      'conflict',
      `${lost.map((cluster) => cluster.id).join(', ')} has a written reply. Keep that cluster and at least one of its points; only the person removes written text.`
    )
  }
}

export function setClusters(project, slug, input) {
  return updateRebuttal(project, slug, async (bundle) => {
    const clusters = parseClusters(withoutReplyText(input, bundle), {
      pointIds: bundle.points.map((point) => point.id),
      previous: bundle.clusters
    })
    refuseLosingWrittenReply(
      bundle,
      new Set(clusters.map((cluster) => cluster.id)),
      new Set(bundle.points.map((point) => point.id))
    )
    await saveClusters(bundle, clusters)
    const clustered = new Set(clusters.flatMap((cluster) => cluster.points))
    return {
      clusters,
      unclustered: bundle.points.filter((point) => !clustered.has(point.id)).map((p) => p.id)
    }
  })
}

export async function listClusters(project, slug) {
  const { clusters } = await loadRebuttal(project, slug)
  return { clusters }
}

/** Writes the assembled outputs under responses/ and reports each one's length against its limit. */
export async function assembleRebuttal(project, slug, { format = 'all', shared } = {}) {
  if (!['reviewer', 'general', 'pdf', 'all'].includes(format)) {
    throw new HarnessError('usage', '--format takes reviewer, general, pdf or all')
  }
  if (shared !== undefined && !SHARED_ANSWER_MODES.includes(shared)) {
    throw new HarnessError('usage', `--shared takes ${SHARED_ANSWER_MODES.join(', ')}`)
  }
  const bundle = await loadRebuttal(project, slug)
  await mkdir(bundle.files.responses, { recursive: true })
  const outputs = []
  const write = async (name, text, extra) => {
    const target = path.join(bundle.files.responses, name)
    await writeTextAtomically(target, text.endsWith('\n') ? text : `${text}\n`)
    outputs.push({ path: projectRelative(project, target), ...extra })
  }
  if (format === 'reviewer' || format === 'all') {
    for (const reply of assembleAllReplies(bundle, { shared })) {
      const { text, ...facts } = reply
      await write(reviewerReplyFileName(reply), text, { kind: 'reviewer', ...facts })
    }
  }
  if (format === 'general' || format === 'all') {
    const { text, ...facts } = assembleGeneralResponse(bundle)
    await write('general.md', text, { kind: 'general', ...facts })
  }
  if (format === 'pdf' || format === 'all') {
    const { text, missing } = assembleRebuttalLatex(bundle)
    await write('rebuttal.tex', text, { kind: 'pdf', missing, pages: bundle.meta.limits.pdfPages })
  }
  return { outputs, readiness: rebuttalReadiness(bundle) }
}

export async function showRebuttal(project, slug) {
  const bundle = await loadRebuttal(project, slug)
  return {
    rebuttal: bundle.meta,
    path: projectRelative(project, bundle.files.directory),
    counts: {
      reviewers: bundle.meta.reviewers.length,
      points: bundle.points.length,
      clusters: bundle.clusters.length,
      done: bundle.clusters.filter((cluster) => cluster.status === 'done').length,
      promises: bundle.promises.length
    },
    readiness: rebuttalReadiness(bundle)
  }
}

export function addPromise(project, slug, { text, clusters = [] }) {
  return updateRebuttal(project, slug, async (bundle) => {
    const promise = {
      id: nextSequentialId('P', bundle.promises),
      text,
      clusters,
      done: false,
      createdAt: new Date().toISOString()
    }
    const promises = parsePromises([...bundle.promises, promise], {
      clusterIds: bundle.clusters.map((cluster) => cluster.id)
    })
    await writeJsonAtomically(bundle.files.promises, promisesDocument(promises))
    return { promise: promises.find((entry) => entry.id === promise.id) }
  })
}

export async function listPromises(project, slug) {
  const { promises } = await loadRebuttal(project, slug)
  return { promises }
}

export function setPromiseDone(project, slug, { id, done }) {
  return updateRebuttal(project, slug, async (bundle) => {
    if (!bundle.promises.some((promise) => promise.id === id)) {
      throw new HarnessError('not_found', `No promise ${id}.`)
    }
    const promises = bundle.promises.map((promise) =>
      promise.id === id ? { ...promise, done } : promise
    )
    await writeJsonAtomically(bundle.files.promises, promisesDocument(promises))
    return { promise: promises.find((promise) => promise.id === id) }
  })
}
