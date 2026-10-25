import { useEffect } from 'react'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { catalogRunReference, harnessExperimentSlug } from './use-research-harness-experiment'
import {
  researchOrganizeBridge,
  type ResearchRunSummariesState
} from './use-research-run-summaries'

const ENDED_STATES = new Set<ResearchRunRecord['execution']>(['succeeded', 'failed', 'cancelled'])
// Why module scope: one attempt per Run per app session, across remounts, so a Run whose
// summary organizing cannot fix never turns into a retry loop.
const attemptedRuns = new Set<string>()

/** A summary written before the Run ended still records the earlier state. */
function summaryIsStale(run: ResearchRunRecord, summary: ResearchRunSummary | null): boolean {
  return !summary || summary.state !== run.execution
}

/** Organizes ended catalog Runs whose summary.json is missing or older than the Run's end. */
export function useResearchAutoOrganize(
  experiment: ExperimentRecord | undefined,
  runs: ResearchRunRecord[],
  summaries: ResearchRunSummariesState
): void {
  const slug = harnessExperimentSlug(experiment)
  const workspacePath = experiment?.workspacePath ?? null
  const { byRun, loading, error, refresh } = summaries

  useEffect(() => {
    const { organize } = researchOrganizeBridge()
    if (!slug || !workspacePath || !organize || loading || error) {
      return
    }
    const stale: string[] = []
    for (const run of runs) {
      const reference = catalogRunReference(run)
      // Why byRun.has: only Runs the last summaries read listed, so an unread one is not "missing".
      if (!reference || !ENDED_STATES.has(run.execution) || !byRun.has(reference)) {
        continue
      }
      const key = JSON.stringify([workspacePath, reference])
      if (!attemptedRuns.has(key) && summaryIsStale(run, byRun.get(reference) ?? null)) {
        attemptedRuns.add(key)
        stale.push(reference)
      }
    }
    if (!stale.length) {
      return
    }
    // Why one call for several: rule checks read the whole Experiment once instead of per Run.
    void organize(
      stale.length === 1 ? { workspacePath, run: stale[0] } : { workspacePath, experiment: slug }
    )
      .then(() => refresh())
      .catch(() => undefined)
  }, [byRun, error, loading, refresh, runs, slug, workspacePath])
}
