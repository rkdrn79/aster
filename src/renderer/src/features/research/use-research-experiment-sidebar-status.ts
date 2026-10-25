import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { experimentNeedsYou } from './research-experiment-needs-you'
import { readKeys } from './research-experiment-dismissed-runs'
import { harnessExperimentSlug } from './use-research-harness-experiment'

// Why: the sidebar only summarizes; the open notebook polls its own Experiment every 10 s.
const POLL_MS = 60_000
const NO_STATUSES: ReadonlyMap<string, ExperimentSidebarStatus> = new Map()

export type ExperimentSidebarStatus = {
  /** failed beats needs-you beats running: the dot shows the most urgent. */
  state: 'failed' | 'needs-you' | 'running' | null
  needsYou: number
}

type Notes = { findings: readonly ResearchFinding[]; proposals: readonly ResearchProposal[] }

/** The notebook's Needs-you list and Run states, folded into one dot and a count. */
export function experimentSidebarStatus(input: {
  runs: readonly ResearchRunRecord[]
  findings: readonly ResearchFinding[]
  proposals: readonly ResearchProposal[]
  dismissedRuns: ReadonlySet<string>
}): ExperimentSidebarStatus {
  const items = experimentNeedsYou({
    runs: input.runs,
    statusOf: (run) => ({ state: run.execution }),
    findings: input.findings,
    proposals: input.proposals,
    dismissedRuns: input.dismissedRuns
  })
  const failed = items.some(
    (item) =>
      item.kind === 'failed-run' || (item.kind === 'finding' && item.finding.severity === 'fail')
  )
  const running = input.runs.some((run) => run.execution === 'running')
  return {
    state: failed ? 'failed' : items.length > 0 ? 'needs-you' : running ? 'running' : null,
    needsYou: items.length
  }
}

async function readNotes(experiment: ExperimentRecord): Promise<Notes | null> {
  const slug = harnessExperimentSlug(experiment)
  const listFindings = window.api.researchFindings?.list
  const listProposals = window.api.researchProposals?.list
  if (!slug || !listFindings || !listProposals) {
    return null
  }
  const params = { workspacePath: experiment.workspacePath, experiment: slug }
  const [findings, proposals] = await Promise.all([
    listFindings({ ...params, status: 'open' }).then(
      (value) => value.findings,
      () => []
    ),
    listProposals({ ...params, state: 'all' }).then(
      (value) => value.proposals,
      () => []
    )
  ])
  return { findings, proposals }
}

/** Status of each listed Experiment; findings and proposals are re-read every minute while visible. */
export function useResearchExperimentSidebarStatus(
  experiments: readonly ExperimentRecord[],
  runs: readonly ResearchRunRecord[],
  enabled: boolean
): ReadonlyMap<string, ExperimentSidebarStatus> {
  const [notes, setNotes] = useState<ReadonlyMap<string, Notes>>(new Map())
  const watched = experiments.filter(
    (experiment) => !experiment.archived && harnessExperimentSlug(experiment)
  )
  // Why: key on identity, not the array, so a records save that keeps the list never re-polls.
  const watchKey = JSON.stringify(
    watched.map((experiment) => [experiment.id, experiment.workspacePath, experiment.catalogSlug])
  )
  const watchedRef = useRef(watched)
  useEffect(() => {
    watchedRef.current = watched
  })

  useEffect(() => {
    if (!enabled || watchKey === '[]') {
      return
    }
    let active = true
    let reading = false
    const read = async (): Promise<void> => {
      if (reading) {
        return
      }
      reading = true
      try {
        const next = new Map<string, Notes>()
        await Promise.all(
          watchedRef.current.map(async (experiment) => {
            const value = await readNotes(experiment)
            if (value) {
              next.set(experiment.id, value)
            }
          })
        )
        if (active) {
          setNotes(next)
        }
      } finally {
        reading = false
      }
    }
    const stop = installWindowVisibilityInterval({ run: () => void read(), intervalMs: POLL_MS })
    return () => {
      active = false
      stop()
    }
  }, [enabled, watchKey])

  return useMemo(() => {
    if (!enabled) {
      return NO_STATUSES
    }
    const statuses = new Map<string, ExperimentSidebarStatus>()
    for (const experiment of experiments) {
      const note = notes.get(experiment.id)
      statuses.set(
        experiment.id,
        experimentSidebarStatus({
          runs: runs.filter((run) => run.experimentId === experiment.id),
          findings: note?.findings ?? [],
          proposals: note?.proposals ?? [],
          dismissedRuns: new Set(readKeys(experiment.id))
        })
      )
    }
    return statuses
  }, [enabled, experiments, notes, runs])
}
