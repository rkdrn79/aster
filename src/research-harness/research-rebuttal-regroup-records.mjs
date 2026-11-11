import { invalid, isObject } from './research-rebuttal-fields.mjs'
import { REBUTTAL_SCHEMA_VERSION, nextSequentialId } from './research-rebuttal-model.mjs'
import { withTranslations } from './research-rebuttal-translations.mjs'

// Why no node imports: the app undoes, holds and accepts regroups with the same records.
// regroups.json keeps each regroup that touched written replies (G1…), with what the affected
// groups were before and became after, so one Undo puts them back exactly; and an archive (A1…)
// of groups removed with their replies, each restorable on its own.

const MAX_REGROUPS = 20
const MAX_ARCHIVED = 200
const REGROUP_ID = /^G[1-9][0-9]{0,4}$/
const ARCHIVE_ID = /^A[1-9][0-9]{0,4}$/

export function parseRegroups(value) {
  const document = isObject(value) ? value : { regroups: [], archive: [] }
  const regroups = (Array.isArray(document.regroups) ? document.regroups : []).map((entry) => {
    if (!isObject(entry) || typeof entry.id !== 'string' || !REGROUP_ID.test(entry.id)) {
      throw invalid(`A regroup ID must look like G1, got: ${String(entry?.id)}`)
    }
    if (!isObject(entry.before) || !isObject(entry.after) || !Array.isArray(entry.affected)) {
      throw invalid(`${entry.id} needs before, after and affected`)
    }
    return { ...entry, applied: entry.applied === true }
  })
  const archive = (Array.isArray(document.archive) ? document.archive : []).map((entry) => {
    if (!isObject(entry) || typeof entry.id !== 'string' || !ARCHIVE_ID.test(entry.id)) {
      throw invalid(`An archived group ID must look like A1, got: ${String(entry?.id)}`)
    }
    if (!isObject(entry.cluster) || typeof entry.cluster.id !== 'string') {
      throw invalid(`${entry.id} needs the group it archived`)
    }
    return {
      ...entry,
      points: Array.isArray(entry.points) ? entry.points : [],
      paperChanges: Array.isArray(entry.paperChanges) ? entry.paperChanges : []
    }
  })
  return { regroups, archive }
}

export function regroupsDocument({ regroups, archive }) {
  return {
    schemaVersion: REBUTTAL_SCHEMA_VERSION,
    regroups: regroups.slice(-MAX_REGROUPS),
    archive: archive.slice(-MAX_ARCHIVED)
  }
}

/** The fields of a group that an Undo puts back and that a later edit would change. */
export function clusterFingerprint(cluster) {
  if (!cluster) {
    return 'absent'
  }
  const { id, title, points, action, status, plan, response, author, general } = cluster
  return JSON.stringify([
    id,
    title,
    points,
    action,
    status,
    plan,
    response,
    author ?? null,
    general
  ])
}

function pointsFingerprint(points) {
  return JSON.stringify(points.map((point) => [point.id, point.summary, point.quote, point.round]))
}

function byId(items) {
  return new Map(items.map((item) => [item.id, item]))
}

function sortClusters(clusters) {
  return clusters.toSorted((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)))
}

/**
 * The record of a planned regroup: what the affected groups and their links were before and
 * became after, the agent's input (so a held or proposed regroup can be planned again), and why.
 */
export function regroupRecord(state, plan, input) {
  const affected = new Set(plan.affected)
  const before = state.clusters.filter((cluster) => affected.has(cluster.id))
  const after = plan.clusters.filter((cluster) => affected.has(cluster.id))
  const pointsChanged = pointsFingerprint(plan.points) !== pointsFingerprint(state.points)
  const keys = new Set([...affected].flatMap((id) => [`reply:${id}`, `title:${id}`]))
  const touches = (ids) => ids.some((id) => affected.has(id))
  return {
    id: input.id,
    at: input.at,
    turn: input.turn ?? null,
    request: input.request ?? '',
    applied: input.applied,
    summary: plan.summary,
    affected: plan.affected,
    before: {
      clusters: before,
      points: pointsChanged ? state.points : null,
      promises: state.promises.filter((promise) => touches(promise.clusters)),
      paperChanges: state.paperChanges.filter((change) => affected.has(change.cluster)),
      predictions: state.predictions
        .filter((prediction) => affected.has(prediction.trigger.cluster ?? ''))
        .map((prediction) => ({ id: prediction.id, trigger: prediction.trigger })),
      proposals: state.proposals.filter((proposal) => affected.has(proposal.slot)),
      translations: state.translations.filter((entry) => keys.has(entry.key))
    },
    after: { clusters: after, points: pointsChanged ? plan.points : null },
    input: input.change,
    supplied: Object.fromEntries(input.supplied ?? [])
  }
}

export function nextRegroupId(regroups, archive) {
  const used = [
    ...regroups.map((entry) => entry.id),
    ...archive.map((entry) => entry.regroup ?? '')
  ]
  return nextSequentialId(
    'G',
    used.filter((id) => REGROUP_ID.test(id)).map((id) => ({ id }))
  )
}

/** The records after applying `plan` as regroup `record` (or as a plain change when it is null). */
export function stateAfterPlan(state, plan, record) {
  let archive = state.archive
  for (const entry of plan.archive) {
    archive = [
      ...archive,
      {
        id: nextSequentialId('A', archive),
        regroup: record?.id ?? null,
        at: record?.at ?? '',
        ...entry
      }
    ]
  }
  return {
    ...state,
    clusters: plan.clusters,
    points: plan.points,
    promises: plan.promises,
    paperChanges: plan.paperChanges,
    predictions: plan.predictions,
    proposals: plan.proposals,
    regroups: record
      ? [...state.regroups.filter((entry) => entry.id !== record.id), record]
      : state.regroups,
    archive
  }
}

/** The affected groups that changed since the regroup, so Undo would overwrite later edits. */
export function changedSinceRegroup(state, record) {
  const current = byId(state.clusters)
  const after = byId(record.after.clusters)
  const changed = record.affected.filter(
    (id) => clusterFingerprint(current.get(id)) !== clusterFingerprint(after.get(id))
  )
  if (
    record.after.points &&
    pointsFingerprint(state.points) !== pointsFingerprint(record.after.points)
  ) {
    changed.push('the concerns')
  }
  return changed
}

/** The records with the affected groups, their links and their translations as they were before. */
export function stateBeforeRegroup(state, record) {
  const affected = new Set(record.affected)
  const before = record.before
  const promises = byId(before.promises)
  const triggers = byId(before.predictions)
  const paper = byId(before.paperChanges)
  const archived = state.archive.filter((entry) => entry.regroup === record.id)
  const restoredChanges = archived.flatMap((entry) => entry.paperChanges)
  const present = new Set(state.paperChanges.map((change) => change.id))
  let translations = state.translations
  for (const language of new Set(before.translations.map((entry) => entry.language))) {
    translations = withTranslations(
      translations,
      before.translations.filter((entry) => entry.language === language),
      { language, now: before.translations.find((entry) => entry.language === language)?.at ?? '' }
    )
  }
  return {
    ...state,
    clusters: sortClusters([
      ...state.clusters.filter((cluster) => !affected.has(cluster.id)),
      ...before.clusters
    ]),
    points: before.points ?? state.points,
    promises: state.promises.map((promise) =>
      promises.has(promise.id)
        ? { ...promise, clusters: promises.get(promise.id).clusters }
        : promise
    ),
    paperChanges: [
      ...state.paperChanges.map((change) =>
        paper.has(change.id) ? { ...change, cluster: paper.get(change.id).cluster } : change
      ),
      ...restoredChanges.filter((change) => !present.has(change.id))
    ],
    predictions: state.predictions.map((prediction) =>
      triggers.has(prediction.id)
        ? { ...prediction, trigger: triggers.get(prediction.id).trigger }
        : prediction
    ),
    proposals: [
      ...state.proposals.filter((proposal) => !affected.has(proposal.slot)),
      ...before.proposals
    ],
    translations,
    regroups: state.regroups.filter((entry) => entry.id !== record.id),
    archive: state.archive.filter((entry) => entry.regroup !== record.id)
  }
}

/**
 * Puts an archived group back with its reply: under its old ID when free, with the concerns that
 * are not in another group now (re-adding ones that were deleted). Throws when none are free.
 */
export function stateWithArchivedRestored(state, archiveId) {
  const entry = state.archive.find((candidate) => candidate.id === archiveId)
  if (!entry) {
    throw invalid(`No archived group ${archiveId}.`)
  }
  const grouped = new Set(state.clusters.flatMap((cluster) => cluster.points))
  const known = new Set(state.points.map((point) => point.id))
  const missing = entry.points.filter((point) => !known.has(point.id))
  const free = entry.cluster.points.filter(
    (id) => !grouped.has(id) && (known.has(id) || missing.some((point) => point.id === id))
  )
  if (!free.length) {
    throw invalid(
      `The concerns of ${entry.cluster.id} are in other groups now. Copy its reply from Versions instead.`
    )
  }
  const id = state.clusters.some((cluster) => cluster.id === entry.cluster.id)
    ? nextSequentialId('C', state.clusters)
    : entry.cluster.id
  const present = new Set(state.paperChanges.map((change) => change.id))
  return {
    ...state,
    clusters: sortClusters([...state.clusters, { ...entry.cluster, id, points: free }]),
    points: [...state.points, ...missing],
    paperChanges: [
      ...state.paperChanges,
      ...entry.paperChanges
        .filter((change) => !present.has(change.id))
        .map((change) => ({ ...change, cluster: id }))
    ],
    archive: state.archive.filter((candidate) => candidate.id !== archiveId),
    restoredAs: id
  }
}
