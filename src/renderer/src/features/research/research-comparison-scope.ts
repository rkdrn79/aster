import type {
  ResearchDocument,
  ResearchRunRecord
} from '../../../../shared/research/research-records'

/** The stored selection's cap (research-records.ts). */
export const MAX_COMPARED_RUNS = 6

/** An Experiment's checked Runs, in the order they were checked. */
export function experimentCheckedRuns(
  document: Pick<ResearchDocument, 'runs' | 'comparisonRunIds'>,
  experimentId: string
): ResearchRunRecord[] {
  const byId = new Map(document.runs.map((run) => [run.id, run]))
  return document.comparisonRunIds.flatMap((id) => {
    const run = byId.get(id)
    return run && run.experimentId === experimentId ? [run] : []
  })
}

/**
 * Checks or unchecks one Run. Runs of other Experiments leave the stored selection, so Runs the
 * Compare tab never shows do not count against the cap.
 */
export function toggleExperimentComparison(
  document: ResearchDocument,
  runId: string,
  limit = MAX_COMPARED_RUNS
): ResearchDocument {
  const target = document.runs.find((run) => run.id === runId)
  if (!target) {
    return document
  }
  const checked = experimentCheckedRuns(document, target.experimentId).map((run) => run.id)
  if (!checked.includes(runId) && checked.length >= limit) {
    return document
  }
  const comparisonRunIds = checked.includes(runId)
    ? checked.filter((id) => id !== runId)
    : [...checked, runId]
  return {
    ...document,
    comparisonRunIds,
    // Why: the stored baseline must stay inside the stored selection (research-records.ts).
    baselineRunId: comparisonRunIds.includes(document.baselineRunId ?? '')
      ? document.baselineRunId
      : (comparisonRunIds[0] ?? null)
  }
}
