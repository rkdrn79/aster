import {
  parseRebuttalMeta,
  type RebuttalBundle,
  type RebuttalMeta
} from '../../../../research-harness/research-rebuttal-model.mjs'
import {
  parseClusters,
  parsePoints,
  parsePromises
} from '../../../../research-harness/research-rebuttal-points.mjs'
import {
  parseFollowUps,
  parsePaperChanges,
  parsePredictions,
  parseProposals,
  type RebuttalFollowUp,
  type RebuttalOutlook,
  type RebuttalPaperChange,
  type RebuttalPrediction,
  type RebuttalReplyProposal
} from '../../../../research-harness/research-rebuttal-records.mjs'
import {
  parseTranslations,
  type RebuttalTranslation
} from '../../../../research-harness/research-rebuttal-translations.mjs'
import type {
  RebuttalArchivedGroup,
  RebuttalRegroup
} from '../../../../research-harness/research-rebuttal-regroup.mjs'
import { parseRegroups } from '../../../../research-harness/research-rebuttal-regroup-records.mjs'
import {
  REBUTTAL_JSON_FILES,
  listRebuttalDirectory,
  readRebuttalText,
  rebuttalRecordRoot,
  statRebuttalFile,
  type RebuttalJsonFile,
  type RebuttalOwner
} from './research-rebuttal-files'

export type RebuttalSummary = { slug: string; name: string; venue: string; reviewers: number }

/** One rebuttal as read from the project, with the raw text each later write is checked against. */
export type RebuttalSnapshot = {
  owner: RebuttalOwner
  /** Project-relative folder, e.g. `.aster/rebuttal/iclr-2027`. */
  directory: string
  bundle: RebuttalBundle
  reviews: Record<string, string>
  followUps: RebuttalFollowUp[]
  /** Agent changes the person has not decided yet. */
  proposals: RebuttalReplyProposal[]
  predictions: RebuttalPrediction[]
  outlooks: RebuttalOutlook[]
  paperChanges: RebuttalPaperChange[]
  /** Translations the agent wrote, each tied to the text it translates. */
  translations: RebuttalTranslation[]
  /** Regroups that touched written replies (undoable or waiting), and groups removed with them. */
  regroups: RebuttalRegroup[]
  archive: RebuttalArchivedGroup[]
  texts: Record<RebuttalJsonFile, string | null>
  /** Files that did not validate; the page is read-only until they do. */
  issues: string[]
  version: string
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function rebuttalsFolder(owner: RebuttalOwner): Promise<string> {
  return `${await rebuttalRecordRoot(owner)}/rebuttal`
}

export async function listRebuttalSummaries(
  owner: RebuttalOwner
): Promise<{ folder: string; rebuttals: RebuttalSummary[] }> {
  const folder = await rebuttalsFolder(owner)
  const entries = (await listRebuttalDirectory(owner, folder)) ?? []
  const rebuttals: RebuttalSummary[] = []
  for (const entry of entries.filter((item) => item.isDirectory).sort(byName)) {
    try {
      const meta = parseRebuttalMeta(
        JSON.parse(await readRebuttalText(owner, `${folder}/${entry.name}/rebuttal.json`))
      )
      rebuttals.push({
        slug: meta.slug,
        name: meta.name,
        venue: meta.venue,
        reviewers: meta.reviewers.length
      })
    } catch {
      // A folder without a readable rebuttal.json is not a rebuttal.
    }
  }
  return { folder, rebuttals }
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name)
}

/** Changes whenever the agent or the app rewrites one of the rebuttal's JSON files. */
export async function rebuttalVersion(owner: RebuttalOwner, directory: string): Promise<string> {
  const entries = (await listRebuttalDirectory(owner, directory)) ?? []
  const names = new Set(entries.map((entry) => entry.name))
  const parts = await Promise.all(
    Object.values(REBUTTAL_JSON_FILES).map(async (name) =>
      names.has(name) ? `${name}=${await statRebuttalFile(owner, `${directory}/${name}`)}` : name
    )
  )
  return parts.join('|')
}

async function readJsonFiles(
  owner: RebuttalOwner,
  directory: string
): Promise<Record<RebuttalJsonFile, string | null>> {
  const names = new Set(
    ((await listRebuttalDirectory(owner, directory)) ?? []).map((entry) => entry.name)
  )
  const read = async (key: RebuttalJsonFile): Promise<string | null> =>
    names.has(REBUTTAL_JSON_FILES[key])
      ? readRebuttalText(owner, `${directory}/${REBUTTAL_JSON_FILES[key]}`)
      : null
  const [
    meta,
    points,
    clusters,
    promises,
    followUps,
    proposals,
    predictions,
    paperChanges,
    translations,
    regroups
  ] = await Promise.all([
    read('meta'),
    read('points'),
    read('clusters'),
    read('promises'),
    read('followUps'),
    read('proposals'),
    read('predictions'),
    read('paperChanges'),
    read('translations'),
    read('regroups')
  ])
  return {
    meta,
    points,
    clusters,
    promises,
    followUps,
    proposals,
    predictions,
    paperChanges,
    translations,
    regroups
  }
}

async function readReviews(
  owner: RebuttalOwner,
  directory: string,
  meta: RebuttalMeta
): Promise<Record<string, string>> {
  const names = new Set(
    ((await listRebuttalDirectory(owner, `${directory}/reviews`)) ?? []).map((entry) => entry.name)
  )
  const reviews: Record<string, string> = {}
  for (const reviewer of meta.reviewers) {
    reviews[reviewer.id] = names.has(`${reviewer.id}.md`)
      ? await readRebuttalText(owner, `${directory}/reviews/${reviewer.id}.md`)
      : ''
  }
  return reviews
}

function parseJson(text: string | null): unknown {
  return text === null ? [] : JSON.parse(text)
}

/** Reads and validates every file; a file that does not validate is reported, not thrown. */
export async function loadRebuttalSnapshot(
  owner: RebuttalOwner,
  folder: string,
  slug: string
): Promise<RebuttalSnapshot> {
  const directory = `${folder}/${slug}`
  const version = await rebuttalVersion(owner, directory)
  const texts = await readJsonFiles(owner, directory)
  if (texts.meta === null) {
    throw new Error(`${directory}/rebuttal.json is missing.`)
  }
  const meta = parseRebuttalMeta(JSON.parse(texts.meta))
  const reviews = await readReviews(owner, directory, meta)
  const issues: string[] = []
  const attempt = <T>(file: string, parse: () => T, fallback: T): T => {
    try {
      return parse()
    } catch (error) {
      issues.push(`${file}: ${errorText(error)}`)
      return fallback
    }
  }
  const followUps = attempt(
    'followups.json',
    () => parseFollowUps(parseJson(texts.followUps), { reviewers: meta.reviewers }),
    []
  )
  const points = attempt(
    'points.json',
    () => parsePoints(parseJson(texts.points), { reviewers: meta.reviewers, reviews, followUps }),
    []
  )
  const clusters = attempt(
    'clusters.json',
    () => parseClusters(parseJson(texts.clusters), { pointIds: points.map((point) => point.id) }),
    []
  )
  const clusterIds = clusters.map((cluster) => cluster.id)
  const promises = attempt(
    'promises.json',
    () => parsePromises(parseJson(texts.promises), { clusterIds }),
    []
  )
  const proposals = attempt('proposals.json', () => parseProposals(parseJson(texts.proposals)), [])
  const { predictions, outlooks } = attempt(
    'predictions.json',
    () =>
      parsePredictions(texts.predictions === null ? [] : JSON.parse(texts.predictions), {
        reviewers: meta.reviewers,
        clusterIds
      }),
    { predictions: [], outlooks: [] }
  )
  const paperChanges = attempt(
    'paper-changes.json',
    () => parsePaperChanges(parseJson(texts.paperChanges), { clusterIds }),
    []
  )
  const translations = attempt(
    'translations.json',
    () => parseTranslations(parseJson(texts.translations)),
    []
  )
  const { regroups, archive } = attempt(
    'regroups.json',
    () => parseRegroups(texts.regroups === null ? null : JSON.parse(texts.regroups)),
    { regroups: [], archive: [] }
  )
  return {
    owner,
    directory,
    bundle: { meta, points, clusters, promises },
    reviews,
    followUps,
    proposals,
    predictions,
    outlooks,
    paperChanges,
    translations,
    regroups,
    archive,
    texts,
    issues,
    version
  }
}
