import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { withFileLock, writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { researchPaths } from './research-layout.mjs'
import {
  REBUTTAL_GITIGNORE,
  newRebuttalMeta,
  parseRebuttalMeta,
  rebuttalSlug,
  safeRebuttalSlug
} from './research-rebuttal-model.mjs'
import { parseClusters, parsePoints, parsePromises } from './research-rebuttal-points.mjs'
import {
  parseFollowUps,
  parsePaperChanges,
  parsePredictions,
  parseProposals
} from './research-rebuttal-records.mjs'
import { parseTranslations } from './research-rebuttal-translations.mjs'
import { parseRegroups } from './research-rebuttal-regroup-records.mjs'

export function rebuttalRoot(project) {
  return path.join(researchPaths(project).root, 'rebuttal')
}

export function rebuttalFiles(project, slug) {
  const directory = path.join(rebuttalRoot(project), safeRebuttalSlug(slug))
  return {
    directory,
    meta: path.join(directory, 'rebuttal.json'),
    reviews: path.join(directory, 'reviews'),
    points: path.join(directory, 'points.json'),
    clusters: path.join(directory, 'clusters.json'),
    promises: path.join(directory, 'promises.json'),
    followUps: path.join(directory, 'followups.json'),
    proposals: path.join(directory, 'proposals.json'),
    predictions: path.join(directory, 'predictions.json'),
    paperChanges: path.join(directory, 'paper-changes.json'),
    translations: path.join(directory, 'translations.json'),
    regroups: path.join(directory, 'regroups.json'),
    history: path.join(directory, 'history'),
    responses: path.join(directory, 'responses'),
    lock: path.join(directory, '.rebuttal.lock')
  }
}

export function projectRelative(project, target) {
  return path.relative(project, target).split(path.sep).join('/')
}

export async function readJsonIfPresent(target) {
  let content
  try {
    content = await readFile(target, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
  try {
    return JSON.parse(content)
  } catch (error) {
    throw new HarnessError('invalid_json', `${target}: ${error.message}`)
  }
}

export async function readTextIfPresent(target) {
  try {
    return await readFile(target, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return ''
    }
    throw error
  }
}

export async function writeTextAtomically(target, content) {
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temporary, content, { flag: 'wx' })
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

/** Every file of one rebuttal, validated together: points against reviews, clusters against points. */
export async function loadRebuttal(project, slug) {
  const files = rebuttalFiles(project, slug)
  const rawMeta = await readJsonIfPresent(files.meta)
  if (!rawMeta) {
    throw new HarnessError(
      'not_found',
      `No rebuttal "${slug}" in ${projectRelative(project, rebuttalRoot(project))}. Create it with rebuttal new --name NAME.`
    )
  }
  const meta = parseRebuttalMeta(rawMeta)
  const reviews = {}
  for (const reviewer of meta.reviewers) {
    reviews[reviewer.id] = await readTextIfPresent(path.join(files.reviews, `${reviewer.id}.md`))
  }
  const followUps = parseFollowUps((await readJsonIfPresent(files.followUps)) ?? [], {
    reviewers: meta.reviewers
  })
  const points = parsePoints((await readJsonIfPresent(files.points)) ?? [], {
    reviewers: meta.reviewers,
    reviews,
    followUps
  })
  const clusters = parseClusters((await readJsonIfPresent(files.clusters)) ?? [], {
    pointIds: points.map((point) => point.id)
  })
  const clusterIds = clusters.map((cluster) => cluster.id)
  const promises = parsePromises((await readJsonIfPresent(files.promises)) ?? [], { clusterIds })
  const proposals = parseProposals((await readJsonIfPresent(files.proposals)) ?? [])
  const { predictions, outlooks } = parsePredictions(
    (await readJsonIfPresent(files.predictions)) ?? { predictions: [], outlooks: [] },
    { reviewers: meta.reviewers, clusterIds }
  )
  const paperChanges = parsePaperChanges((await readJsonIfPresent(files.paperChanges)) ?? [], {
    clusterIds
  })
  const translations = parseTranslations((await readJsonIfPresent(files.translations)) ?? [])
  const { regroups, archive } = parseRegroups(await readJsonIfPresent(files.regroups))
  return {
    files,
    meta,
    reviews,
    points,
    clusters,
    promises,
    followUps,
    proposals,
    predictions,
    outlooks,
    paperChanges,
    translations,
    regroups,
    archive
  }
}

export async function listRebuttals(project) {
  let entries = []
  try {
    entries = await readdir(rebuttalRoot(project), { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
  const rebuttals = []
  const folders = entries.filter((item) => item.isDirectory()).map((item) => item.name)
  for (const name of folders.sort()) {
    const meta = await readJsonIfPresent(
      path.join(rebuttalRoot(project), name, 'rebuttal.json')
    ).catch(() => null)
    if (meta) {
      const parsed = parseRebuttalMeta(meta)
      rebuttals.push({
        slug: parsed.slug,
        name: parsed.name,
        venue: parsed.venue,
        reviewers: parsed.reviewers.map((reviewer) => reviewer.id),
        path: projectRelative(project, rebuttalFiles(project, parsed.slug).directory)
      })
    }
  }
  return { rebuttals }
}

/** The rebuttal a command means: the one named, or the project's only one. */
export async function resolveRebuttalSlug(project, slug) {
  if (slug) {
    return safeRebuttalSlug(slug)
  }
  const { rebuttals } = await listRebuttals(project)
  if (rebuttals.length === 1) {
    return rebuttals[0].slug
  }
  throw new HarnessError(
    'usage',
    rebuttals.length
      ? `Pass --rebuttal SLUG (this project has: ${rebuttals.map((entry) => entry.slug).join(', ')})`
      : 'This project has no rebuttal yet. Create one with rebuttal new --name NAME.'
  )
}

export async function createRebuttal(project, options) {
  const slug = options.slug ? safeRebuttalSlug(options.slug) : rebuttalSlug(options.name)
  const files = rebuttalFiles(project, slug)
  if (await readJsonIfPresent(files.meta)) {
    throw new HarnessError('already_exists', `Rebuttal "${slug}" already exists.`)
  }
  const meta = newRebuttalMeta({ ...options, slug, now: new Date().toISOString() })
  await mkdir(files.reviews, { recursive: true })
  await mkdir(files.responses, { recursive: true })
  const ignore = path.join(rebuttalRoot(project), '.gitignore')
  if (!(await readTextIfPresent(ignore))) {
    await writeTextAtomically(ignore, REBUTTAL_GITIGNORE)
  }
  await writeJsonAtomically(files.meta, meta)
  return { rebuttal: meta, path: projectRelative(project, files.directory) }
}

export async function updateRebuttal(project, slug, change) {
  // Why load first: a missing rebuttal reports itself instead of failing to take the lock.
  const { files } = await loadRebuttal(project, slug)
  return withFileLock(files.lock, async () => change(await loadRebuttal(project, slug)))
}
