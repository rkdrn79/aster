import {
  MAX_REVIEW_CHARS,
  clustersDocument,
  newRebuttalMeta,
  nextReviewerId,
  parseRebuttalMeta,
  pointsDocument,
  promisesDocument,
  REBUTTAL_GITIGNORE,
  rebuttalSlug,
  serializeRebuttalJson,
  type RebuttalCluster,
  type RebuttalMeta,
  type RebuttalPoint,
  type RebuttalPromise,
  type RebuttalReviewer
} from '../../../../research-harness/research-rebuttal-model.mjs'
import {
  parseClusters,
  parsePoints,
  parsePromises
} from '../../../../research-harness/research-rebuttal-points.mjs'
import {
  RebuttalWriteConflict,
  ensureRebuttalFolders,
  listRebuttalDirectory,
  readRebuttalText,
  writeRebuttalText,
  type RebuttalJsonFileName,
  type RebuttalOwner
} from './research-rebuttal-files'
import { rebuttalsFolder, type RebuttalSnapshot } from './research-rebuttal-snapshot'
import { openRebuttalProject, reloadRebuttal } from './research-rebuttal-store'

/**
 * Applies `change` to what is on disk now and saves it; when the agent wrote in between, the
 * change is applied once more to its version instead of overwriting it.
 */
export async function withFreshSnapshot(
  owner: RebuttalOwner,
  change: (snapshot: RebuttalSnapshot) => Promise<void>
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const snapshot = await reloadRebuttal(owner)
    if (snapshot.issues.length) {
      throw new Error(`Fix the rebuttal files first: ${snapshot.issues.join(' ')}`)
    }
    try {
      await change(snapshot)
      await reloadRebuttal(owner)
      return
    } catch (error) {
      if (!(error instanceof RebuttalWriteConflict) || attempt > 0) {
        await reloadRebuttal(owner).catch(() => undefined)
        throw error
      }
    }
  }
}

export function writeJson(
  snapshot: RebuttalSnapshot,
  name: RebuttalJsonFileName,
  previous: string | null,
  value: unknown
): Promise<void> {
  return writeRebuttalText(
    snapshot.owner,
    `${snapshot.directory}/${name}`,
    serializeRebuttalJson(value),
    previous
  )
}

export async function createRebuttal(
  owner: RebuttalOwner,
  input: { name: string; venue: string; replyChars: number; forum?: string | null }
): Promise<string> {
  const folder = await rebuttalsFolder(owner)
  const slug = rebuttalSlug(input.name)
  const existing = await listRebuttalDirectory(owner, folder)
  if (existing?.some((entry) => entry.name === slug)) {
    throw new Error(`A rebuttal named "${slug}" already exists.`)
  }
  const meta = newRebuttalMeta({ ...input, slug, now: new Date().toISOString() })
  await ensureRebuttalFolders(owner, `${folder}/${slug}`)
  if (!existing?.some((entry) => entry.name === '.gitignore')) {
    await writeRebuttalText(owner, `${folder}/.gitignore`, REBUTTAL_GITIGNORE, null)
  }
  await writeRebuttalText(
    owner,
    `${folder}/${slug}/rebuttal.json`,
    serializeRebuttalJson(meta),
    null
  )
  await openRebuttalProject(owner, slug)
  return slug
}

export function updateRebuttalMeta(
  owner: RebuttalOwner,
  change: (meta: RebuttalMeta) => RebuttalMeta
): Promise<void> {
  return withFreshSnapshot(owner, async (snapshot) => {
    const meta = parseRebuttalMeta({
      ...change(snapshot.bundle.meta),
      updatedAt: new Date().toISOString()
    })
    await writeJson(snapshot, 'rebuttal.json', snapshot.texts.meta, meta)
  })
}

export function updateRebuttalClusters(
  owner: RebuttalOwner,
  change: (clusters: RebuttalCluster[], snapshot: RebuttalSnapshot) => RebuttalCluster[]
): Promise<void> {
  return withFreshSnapshot(owner, async (snapshot) => {
    const clusters = parseClusters(change(snapshot.bundle.clusters, snapshot), {
      pointIds: snapshot.bundle.points.map((point) => point.id)
    })
    await writeJson(snapshot, 'clusters.json', snapshot.texts.clusters, clustersDocument(clusters))
  })
}

export function updateRebuttalPromises(
  owner: RebuttalOwner,
  change: (promises: RebuttalPromise[]) => RebuttalPromise[]
): Promise<void> {
  return withFreshSnapshot(owner, async (snapshot) => {
    const promises = parsePromises(change(snapshot.bundle.promises), {
      clusterIds: snapshot.bundle.clusters.map((cluster) => cluster.id)
    })
    await writeJson(snapshot, 'promises.json', snapshot.texts.promises, promisesDocument(promises))
  })
}

/** Points of `reviewerId` whose quotes a new text no longer contains. */
export function pointsLostByReviewEdit(
  snapshot: RebuttalSnapshot,
  reviewerId: string,
  text: string
): RebuttalPoint[] {
  const reviewers = snapshot.bundle.meta.reviewers
  return snapshot.bundle.points.filter((point) => {
    if (point.reviewer !== reviewerId) {
      return false
    }
    try {
      parsePoints([point], {
        reviewers,
        reviews: { ...snapshot.reviews, [reviewerId]: text },
        followUps: snapshot.followUps
      })
      return false
    } catch {
      return true
    }
  })
}

/**
 * Saves a pasted or edited review; a new review gets the next reviewer ID. Points whose quotes
 * the new text lost are dropped, as `rebuttal add-review --force` does.
 */
export async function saveRebuttalReview(
  owner: RebuttalOwner,
  input: { reviewerId: string | null; text: string; label: string } & Partial<
    Pick<RebuttalReviewer, 'rating' | 'confidence' | 'source' | 'noteId'>
  >
): Promise<string> {
  const text = input.text.trim()
  if (!text) {
    throw new Error('Paste the review text first.')
  }
  if (text.length > MAX_REVIEW_CHARS) {
    throw new Error(`A review may be at most ${MAX_REVIEW_CHARS.toLocaleString()} characters.`)
  }
  let savedId = input.reviewerId ?? ''
  await withFreshSnapshot(owner, async (snapshot) => {
    const { meta } = snapshot.bundle
    const id = input.reviewerId ?? nextReviewerId(meta.reviewers)
    savedId = id
    const path = `${snapshot.directory}/reviews/${id}.md`
    const exists = (await listRebuttalDirectory(owner, `${snapshot.directory}/reviews`))?.some(
      (entry) => entry.name === `${id}.md`
    )
    await writeRebuttalText(
      owner,
      path,
      `${text}\n`,
      exists ? await readRebuttalText(owner, path) : null
    )
    const lost = new Set(pointsLostByReviewEdit(snapshot, id, `${text}\n`).map((point) => point.id))
    if (lost.size) {
      const points = snapshot.bundle.points.filter((point) => !lost.has(point.id))
      await writeJson(snapshot, 'points.json', snapshot.texts.points, pointsDocument(points))
      const clusters = snapshot.bundle.clusters
        .map((cluster) => ({ ...cluster, points: cluster.points.filter((id) => !lost.has(id)) }))
        .filter((cluster) => cluster.points.length > 0)
      await writeJson(
        snapshot,
        'clusters.json',
        snapshot.texts.clusters,
        clustersDocument(clusters)
      )
    }
    const existing = meta.reviewers.find((reviewer) => reviewer.id === id)
    const reviewers = [
      ...meta.reviewers.filter((reviewer) => reviewer.id !== id),
      {
        id,
        label: input.label.trim(),
        rating: input.rating === undefined ? (existing?.rating ?? null) : input.rating,
        confidence:
          input.confidence === undefined ? (existing?.confidence ?? null) : input.confidence,
        source: input.source ?? existing?.source ?? 'paste',
        noteId: input.noteId ?? existing?.noteId ?? null,
        opening: existing?.opening ?? ''
      }
    ]
    const next = parseRebuttalMeta({ ...meta, reviewers, updatedAt: new Date().toISOString() })
    await writeJson(snapshot, 'rebuttal.json', snapshot.texts.meta, next)
  })
  return savedId
}

/** Writes one assembled output under `responses/`, replacing what was generated before. */
export async function writeRebuttalOutput(
  snapshot: RebuttalSnapshot,
  name: string,
  text: string
): Promise<string> {
  const path = `${snapshot.directory}/responses/${name}`
  const exists = (
    await listRebuttalDirectory(snapshot.owner, `${snapshot.directory}/responses`)
  )?.some((entry) => entry.name === name)
  const previous = exists ? await readRebuttalText(snapshot.owner, path) : null
  await writeRebuttalText(snapshot.owner, path, text.endsWith('\n') ? text : `${text}\n`, previous)
  return path
}
