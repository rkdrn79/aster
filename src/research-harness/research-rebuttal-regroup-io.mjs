import { writeJsonAtomically } from './research-file-transactions.mjs'
import { clustersDocument, pointsDocument, promisesDocument } from './research-rebuttal-model.mjs'
import {
  paperChangesDocument,
  predictionsDocument,
  proposalsDocument
} from './research-rebuttal-records.mjs'
import { planRegroup, regroupPhrases } from './research-rebuttal-regroup.mjs'
import {
  nextRegroupId,
  regroupRecord,
  regroupsDocument,
  stateAfterPlan
} from './research-rebuttal-regroup-records.mjs'
import { pushVersion } from './research-rebuttal-replies.mjs'
import { translationsDocument } from './research-rebuttal-translations.mjs'

/** The records a regroup reads and writes, from a loaded rebuttal. */
export function regroupState(bundle) {
  return {
    clusters: bundle.clusters,
    points: bundle.points,
    promises: bundle.promises,
    paperChanges: bundle.paperChanges,
    predictions: bundle.predictions,
    proposals: bundle.proposals,
    translations: bundle.translations,
    regroups: bundle.regroups,
    archive: bundle.archive
  }
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

/** Writes the files whose records differ between `before` and `after`, then the versions. */
export async function writeRegroupState(bundle, before, after, versions) {
  const { files } = bundle
  const writePoints = async () => {
    if (!same(before.points, after.points)) {
      await writeJsonAtomically(files.points, pointsDocument(after.points))
    }
  }
  const writeClusters = async () => {
    if (!same(before.clusters, after.clusters)) {
      await writeJsonAtomically(files.clusters, clustersDocument(after.clusters))
    }
  }
  // Why the order: groups may only name concerns that exist, at every moment the app reads.
  if (after.points.length < before.points.length) {
    await writeClusters()
    await writePoints()
  } else {
    await writePoints()
    await writeClusters()
  }
  if (!same(before.promises, after.promises)) {
    await writeJsonAtomically(files.promises, promisesDocument(after.promises))
  }
  if (!same(before.paperChanges, after.paperChanges)) {
    await writeJsonAtomically(files.paperChanges, paperChangesDocument(after.paperChanges))
  }
  if (!same(before.predictions, after.predictions)) {
    await writeJsonAtomically(
      files.predictions,
      predictionsDocument({ predictions: after.predictions, outlooks: bundle.outlooks })
    )
  }
  if (!same(before.proposals, after.proposals)) {
    await writeJsonAtomically(files.proposals, proposalsDocument(after.proposals))
  }
  if (!same(before.translations, after.translations)) {
    await writeJsonAtomically(files.translations, translationsDocument(after.translations))
  }
  if (!same(before.regroups, after.regroups) || !same(before.archive, after.archive)) {
    await writeJsonAtomically(
      files.regroups,
      regroupsDocument({ regroups: after.regroups, archive: after.archive })
    )
  }
  const at = new Date().toISOString()
  for (const version of versions) {
    await pushVersion(files, version.slot, { ...version, at, turn: null })
  }
}

/**
 * Applies a change of groups or points. When it touches a written reply it is a regroup: in
 * Apply directly it lands (replies carried, the dropped archived, one record to undo); set to
 * Ask first it waits as one proposal and nothing changes yet.
 */
export async function applyRegroup(bundle, change, context = {}) {
  const state = regroupState(bundle)
  const plan = planRegroup(state, change)
  if (!plan.touchesWritten) {
    await writeRegroupState(bundle, state, stateAfterPlan(state, plan, null), plan.versions)
    return { plan, regroup: null }
  }
  // Why `apply`: a replaced review drops its stale points now, or the files stop validating.
  const applied = context.apply ?? bundle.meta.agentEdits !== 'ask'
  const record = regroupRecord(state, plan, {
    id: nextRegroupId(state.regroups, state.archive),
    at: new Date().toISOString(),
    turn: context.turn,
    request: context.request,
    applied,
    change: context.input,
    supplied: change.supplied
  })
  if (!applied) {
    await writeRegroupState(bundle, state, { ...state, regroups: [...state.regroups, record] }, [])
    return { plan, regroup: record }
  }
  await writeRegroupState(bundle, state, stateAfterPlan(state, plan, record), plan.versions)
  return { plan, regroup: record }
}

/** What the CLI reports about a regroup, for the agent. */
export function regroupResult(regroup) {
  if (!regroup) {
    return {}
  }
  return {
    regroup: {
      id: regroup.id,
      applied: regroup.applied,
      summary: regroup.summary,
      changes: regroupPhrases(regroup.summary)
    }
  }
}
