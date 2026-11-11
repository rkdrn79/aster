import {
  clustersDocument,
  pointsDocument,
  promisesDocument
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { parsePoints } from '../../../../research-harness/research-rebuttal-points.mjs'
import {
  paperChangesDocument,
  predictionsDocument,
  proposalsDocument
} from '../../../../research-harness/research-rebuttal-records.mjs'
import {
  planRegroup,
  type RebuttalRegroup,
  type RebuttalRegroupPlan,
  type RebuttalRegroupState
} from '../../../../research-harness/research-rebuttal-regroup.mjs'
import {
  changedSinceRegroup,
  clusterFingerprint,
  regroupRecord,
  regroupsDocument,
  stateAfterPlan,
  stateBeforeRegroup,
  stateWithArchivedRestored
} from '../../../../research-harness/research-rebuttal-regroup-records.mjs'
import { translationsDocument } from '../../../../research-harness/research-rebuttal-translations.mjs'
import type { RebuttalOwner } from './research-rebuttal-files'
import { withFreshSnapshot, writeJson } from './research-rebuttal-mutations'
import { keepVersion } from './research-rebuttal-reply-store'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

// The person's side of a regroup: Undo, accepting or discarding one that waits, holding one that
// landed in a reply being typed in, and restoring a group from the archive.

export function regroupStateOf(snapshot: RebuttalSnapshot): RebuttalRegroupState {
  return {
    clusters: snapshot.bundle.clusters,
    points: snapshot.bundle.points,
    promises: snapshot.bundle.promises,
    paperChanges: snapshot.paperChanges,
    predictions: snapshot.predictions,
    proposals: snapshot.proposals,
    translations: snapshot.translations,
    regroups: snapshot.regroups,
    archive: snapshot.archive
  }
}

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** Writes each record file that changed, then the versions to keep. */
async function writeState(
  snapshot: RebuttalSnapshot,
  before: RebuttalRegroupState,
  after: RebuttalRegroupState,
  versions: RebuttalRegroupPlan['versions']
): Promise<void> {
  const { texts } = snapshot
  const writePoints = (): Promise<void> =>
    same(before.points, after.points)
      ? Promise.resolve()
      : writeJson(snapshot, 'points.json', texts.points, pointsDocument(after.points))
  const writeClusters = (): Promise<void> =>
    same(before.clusters, after.clusters)
      ? Promise.resolve()
      : writeJson(snapshot, 'clusters.json', texts.clusters, clustersDocument(after.clusters))
  // Why the order: groups may only name concerns that exist, at every moment the page reads.
  if (after.points.length < before.points.length) {
    await writeClusters()
    await writePoints()
  } else {
    await writePoints()
    await writeClusters()
  }
  if (!same(before.promises, after.promises)) {
    await writeJson(snapshot, 'promises.json', texts.promises, promisesDocument(after.promises))
  }
  if (!same(before.paperChanges, after.paperChanges)) {
    await writeJson(
      snapshot,
      'paper-changes.json',
      texts.paperChanges,
      paperChangesDocument(after.paperChanges)
    )
  }
  if (!same(before.predictions, after.predictions)) {
    await writeJson(
      snapshot,
      'predictions.json',
      texts.predictions,
      predictionsDocument({ predictions: after.predictions, outlooks: snapshot.outlooks })
    )
  }
  if (!same(before.proposals, after.proposals)) {
    await writeJson(snapshot, 'proposals.json', texts.proposals, proposalsDocument(after.proposals))
  }
  if (!same(before.translations, after.translations)) {
    await writeJson(
      snapshot,
      'translations.json',
      texts.translations,
      translationsDocument(after.translations)
    )
  }
  if (!same(before.regroups, after.regroups) || !same(before.archive, after.archive)) {
    await writeJson(
      snapshot,
      'regroups.json',
      texts.regroups,
      regroupsDocument({ regroups: after.regroups, archive: after.archive })
    )
  }
  for (const version of versions) {
    await keepVersion(snapshot, version.slot, version)
  }
}

function findRegroup(state: RebuttalRegroupState, id: string, applied: boolean) {
  return state.regroups.find((entry) => entry.id === id && entry.applied === applied) ?? null
}

/** What the regrouped replies were, kept as versions before an Undo or hold puts the old ones back. */
function undoneVersions(state: RebuttalRegroupState, record: RebuttalRegroup) {
  const before = new Map(record.before.clusters.map((cluster) => [cluster.id, cluster.response]))
  return state.clusters
    .filter(
      (cluster) =>
        record.affected.includes(cluster.id) &&
        cluster.response.trim() &&
        before.get(cluster.id) !== cluster.response
    )
    .map((cluster) => ({
      slot: cluster.id,
      by: 'agent' as const,
      what: 'Undone regroup',
      text: cluster.response
    }))
}

/** Puts the groups back exactly as before the regroup. Throws when an affected one changed since. */
export async function undoRebuttalRegroup(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const state = regroupStateOf(snapshot)
    const record = findRegroup(state, id, true)
    if (!record) {
      return
    }
    const changed = changedSinceRegroup(state, record)
    if (changed.length) {
      throw new Error(
        `${changed.join(', ')} changed after the regroup, so Undo cannot put the groups back without losing that. Open Versions to restore a reply.`
      )
    }
    await writeState(
      snapshot,
      state,
      stateBeforeRegroup(state, record),
      undoneVersions(state, record)
    )
  })
}

/**
 * The regroup landed while the person typed in an affected reply: put the groups back and keep
 * the regroup waiting, so their words are never moved under them. Does nothing once the groups
 * changed after the regroup.
 */
export async function holdRebuttalRegroup(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const state = regroupStateOf(snapshot)
    const record = findRegroup(state, id, true)
    if (!record || changedSinceRegroup(state, record).length) {
      return
    }
    const restored = stateBeforeRegroup(state, record)
    await writeState(
      snapshot,
      state,
      {
        ...restored,
        regroups: [...restored.regroups, { ...record, applied: false, heldWhileTyping: true }]
      },
      []
    )
  })
}

function pointIdOf(value: unknown): string {
  return typeof value === 'object' && value !== null && 'id' in value ? String(value.id) : ''
}

/** The concerns a waiting points change leaves, keeping ones the person added since. */
function pointsToKeep(snapshot: RebuttalSnapshot, record: RebuttalRegroup) {
  const input = record.input.points ?? []
  const inputIds = new Set(input.map(pointIdOf))
  const beforeIds = new Set((record.before.points ?? []).map((point) => point.id))
  const added = snapshot.bundle.points.filter(
    (point) => !beforeIds.has(point.id) && !inputIds.has(point.id)
  )
  return parsePoints([...input, ...added], {
    reviewers: snapshot.bundle.meta.reviewers,
    reviews: snapshot.reviews,
    followUps: snapshot.followUps
  })
}

/**
 * Applies a waiting regroup to the groups as they are now. The agent's merged text is used only
 * when the replies it merged are unchanged since; otherwise the current replies are joined.
 */
export async function acceptRebuttalRegroup(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const current = regroupStateOf(snapshot)
    const record = findRegroup(current, id, false)
    if (!record) {
      return
    }
    const state = { ...current, regroups: current.regroups.filter((entry) => entry !== record) }
    const byId = new Map(state.clusters.map((cluster) => [cluster.id, cluster]))
    const sourcesChanged = record.before.clusters.some(
      (cluster) => clusterFingerprint(byId.get(cluster.id)) !== clusterFingerprint(cluster)
    )
    const supplied = new Map(sourcesChanged ? [] : Object.entries(record.supplied ?? {}))
    let plan: RebuttalRegroupPlan
    try {
      plan = planRegroup(
        state,
        record.input.points
          ? { points: pointsToKeep(snapshot, record), supplied }
          : { clusters: record.input.clusters, supplied }
      )
    } catch {
      throw new Error('The concerns changed since the agent planned this. Ask it to regroup again.')
    }
    const next = plan.touchesWritten
      ? regroupRecord(state, plan, {
          id: record.id,
          at: new Date().toISOString(),
          turn: record.turn,
          request: record.request,
          applied: true,
          change: record.input,
          supplied
        })
      : null
    await writeState(snapshot, current, stateAfterPlan(state, plan, next), plan.versions)
  })
}

/** Drops a waiting regroup, or hides the notice of an applied one (it stays applied). */
export async function forgetRebuttalRegroup(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const state = regroupStateOf(snapshot)
    if (!state.regroups.some((entry) => entry.id === id)) {
      return
    }
    await writeState(
      snapshot,
      state,
      { ...state, regroups: state.regroups.filter((entry) => entry.id !== id) },
      []
    )
  })
}

/** Puts an archived group back with its reply; resolves to the group ID it has now. */
export async function restoreArchivedRebuttalGroup(
  owner: RebuttalOwner,
  archiveId: string
): Promise<string> {
  let restoredAs = ''
  await withFreshSnapshot(owner, async (snapshot) => {
    const state = regroupStateOf(snapshot)
    const { restoredAs: id, ...next } = stateWithArchivedRestored(state, archiveId)
    restoredAs = id
    await writeState(snapshot, state, next, [])
  })
  return restoredAs
}
