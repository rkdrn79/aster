import { useEffect, useMemo, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { readKeys as readDismissedRunKeys } from './research-experiment-dismissed-runs'
import { summarizeResearchHomeActivity, type ResearchHomeActivity } from './research-home-activity'
import type { ResearchHomeProject } from './research-home-projects'
import { useResearchRecords } from './research-records-store'
import type { ResearchRunStatusFacts } from './research-run-status-label'
import { researchFindingsBridge } from './use-research-findings'
import {
  catalogRunReference,
  harnessExperimentSlug,
  researchHarnessBridge
} from './use-research-harness-experiment'

type LiveSnapshot = {
  live: ReadonlyMap<string, ResearchRunStatusFacts>
  failedFindings: ReadonlyMap<string, 'open' | 'closed'>
}

const NO_LIVE: LiveSnapshot = { live: new Map(), failedFindings: new Map() }

type Candidate = { experiment: ExperimentRecord; slug: string; runs: Map<string, string> }

/** One harness read per local Experiment with a running or failed Run; remote ones use the records. */
async function readCandidate(
  candidate: Candidate,
  live: Map<string, ResearchRunStatusFacts>,
  failedFindings: Map<string, 'open' | 'closed'>
): Promise<void> {
  const { runStatuses } = researchHarnessBridge()
  const { list } = researchFindingsBridge()
  const project = { workspacePath: candidate.experiment.workspacePath, experiment: candidate.slug }
  const [statuses, findings] = await Promise.all([
    runStatuses ? runStatuses(project).catch(() => null) : null,
    list ? list({ ...project, status: 'all' }).catch(() => null) : null
  ])
  for (const status of statuses ?? []) {
    const runId = candidate.runs.get(`${status.experiment}/${status.id}`)
    if (runId) {
      live.set(runId, status)
    }
  }
  for (const finding of findings?.findings ?? []) {
    if (finding.check !== 'run.failed') {
      continue
    }
    for (const reference of finding.runs) {
      const runId = candidate.runs.get(reference)
      if (runId) {
        failedFindings.set(runId, finding.status === 'open' ? 'open' : 'closed')
      }
    }
  }
}

/**
 * Home card counts from the shared research records. Only local Experiments that have a running
 * or failed Run get one run.json and findings read, so launcher-exited Runs read as needing
 * attention rather than running; there is no polling.
 */
export function useResearchHomeActivity(
  projects: readonly ResearchHomeProject[]
): ReadonlyMap<string, ResearchHomeActivity> {
  const records = useResearchRecords((state) => state.document)
  const [snapshot, setSnapshot] = useState<LiveSnapshot>(NO_LIVE)

  useEffect(() => {
    void useResearchRecords.getState().load()
  }, [])

  const candidates = useMemo(() => {
    const byExperiment = new Map<string, Candidate>()
    const experiments = new Map(records?.experiments.map((entry) => [entry.id, entry]) ?? [])
    for (const run of records?.runs ?? []) {
      const experiment = experiments.get(run.experimentId)
      const slug = harnessExperimentSlug(experiment)
      const reference = catalogRunReference(run)
      if (
        !experiment ||
        experiment.archived ||
        !slug ||
        !reference ||
        (run.execution !== 'running' && run.execution !== 'failed')
      ) {
        continue
      }
      const candidate = byExperiment.get(experiment.id) ?? { experiment, slug, runs: new Map() }
      candidate.runs.set(reference, run.id)
      byExperiment.set(experiment.id, candidate)
    }
    return [...byExperiment.values()]
  }, [records])
  const candidateKey = JSON.stringify(
    candidates.map((entry) => [entry.experiment.id, entry.slug, [...entry.runs.values()]])
  )

  useEffect(() => {
    if (!candidates.length) {
      return
    }
    let active = true
    const live = new Map<string, ResearchRunStatusFacts>()
    const failedFindings = new Map<string, 'open' | 'closed'>()
    void Promise.all(candidates.map((entry) => readCandidate(entry, live, failedFindings))).then(
      () => {
        if (active) {
          setSnapshot({ live, failedFindings })
        }
      }
    )
    return () => {
      active = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- records are rebuilt on every write; only the candidate Runs decide a reread.
  }, [candidateKey])

  return useMemo(() => {
    const dismissed = new Map<string, ReadonlySet<string>>()
    return summarizeResearchHomeActivity({
      projects,
      experiments: records?.experiments ?? [],
      runs: records?.runs ?? [],
      // Why: Run ids are stable, so the last read still applies while a newer one is in flight.
      live: snapshot.live,
      failedFindings: snapshot.failedFindings,
      dismissedRuns: (experimentId) => {
        let keys = dismissed.get(experimentId)
        if (!keys) {
          keys = new Set(readDismissedRunKeys(experimentId))
          dismissed.set(experimentId, keys)
        }
        return keys
      }
    })
  }, [projects, records, snapshot])
}
