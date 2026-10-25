import { useEffect, useMemo, useState } from 'react'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import type {
  ResearchHarnessRunStatus,
  ResearchLoopLedger
} from '../../../../shared/research/research-harness-results'
import type { ResearchRunWatchSummary } from '../../../../shared/research/research-run-agent-status'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { useResearchRecords } from './research-records-store'
import type { ResearchRunStatusFacts } from './research-run-status-label'

const RUNNING_POLL_MS = 10_000
const IDLE_POLL_MS = 60_000
const RUN_FOLDER =
  /(?:^|[\\/])(?:\.aster|research)[\\/]experiments[\\/]([^\\/]+)[\\/]runs[\\/]([^\\/]+)[\\/]run\.json$/u

/** The harness bridge, or an empty object when this window's preload predates it. */
export function researchHarnessBridge(): Partial<Window['api']['researchHarness']> {
  return window.api.researchHarness ?? {}
}

/** Harness reads work on local projects with a current or legacy research catalog. */
export function harnessExperimentSlug(experiment: ExperimentRecord | undefined): string | null {
  return experiment?.hostId === 'local' && experiment.catalogSlug ? experiment.catalogSlug : null
}

/** `<experiment>/<run>` for a Run whose run.json sits in the current or legacy catalog. */
export function catalogRunReference(run: Pick<ResearchRunRecord, 'manifestPath'>): string | null {
  const folder = run.manifestPath ? RUN_FOLDER.exec(run.manifestPath) : null
  return folder ? `${folder[1]}/${folder[2]}` : null
}

/** Keeps saved Run statuses in step with run.json so every surface shows the same state. */
async function syncRecordedStatuses(
  experimentId: string,
  live: ReadonlyMap<string, ResearchRunStatusFacts>
): Promise<void> {
  const staleFacts = (run: ResearchRunRecord): ResearchRunStatusFacts | null => {
    const reference = catalogRunReference(run)
    const facts = reference ? live.get(reference) : undefined
    return run.experimentId === experimentId &&
      run.reportedBy !== 'user' &&
      facts &&
      facts.state !== run.execution
      ? facts
      : null
  }
  if (!(useResearchRecords.getState().document?.runs ?? []).some(staleFacts)) {
    return
  }
  const observedAt = new Date().toISOString()
  await useResearchRecords.getState().update((current) => ({
    ...current,
    runs: current.runs.map((run) => {
      const facts = staleFacts(run)
      return facts
        ? { ...run, execution: facts.state, reportedBy: 'manifest' as const, observedAt }
        : run
    })
  }))
}

type HarnessSnapshot = {
  owner: string
  runs: ResearchHarnessRunStatus[]
  loop: ResearchLoopLedger | null
  watches: ResearchRunWatchSummary[]
}

export type ResearchHarnessExperimentState = {
  /** run.json status by `<experiment>/<run>`, with launcher liveness. */
  statuses: ReadonlyMap<string, ResearchRunStatusFacts>
  /** Conditions of active `research watch`es by `<experiment>/<run>`. */
  watches: ReadonlyMap<string, string[]>
  loop: ResearchLoopLedger | null
}

/**
 * Live run.json status, active watches and the loop ledger of one local Experiment, re-read every
 * 10 s while a Run is running and the window is visible, otherwise every minute.
 */
export function useResearchHarnessExperiment(
  experiment: ExperimentRecord | undefined,
  runIdsKey: string
): ResearchHarnessExperimentState {
  const slug = harnessExperimentSlug(experiment)
  const experimentId = experiment?.id ?? null
  const workspacePath = experiment?.workspacePath ?? null
  const [snapshot, setSnapshot] = useState<HarnessSnapshot | null>(null)
  const owner = JSON.stringify([experimentId, workspacePath, slug])
  const current = snapshot?.owner === owner ? snapshot : null
  const anyRunning =
    current?.runs.some((run) => run.state === 'running' && run.liveness !== 'exited') ?? false

  useEffect(() => {
    const { runStatuses, loopShow } = researchHarnessBridge()
    const listWatches = (window.api.researchWatches ?? {}).list
    if (!slug || !workspacePath || !experimentId || !runStatuses || !loopShow) {
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
        const [runs, loop, watches] = await Promise.all([
          runStatuses({ workspacePath, experiment: slug }).catch(() => null),
          loopShow({ workspacePath, experiment: slug }).catch(() => null),
          listWatches
            ? listWatches({ workspacePath, targetId: null }).catch(() => [])
            : Promise.resolve([])
        ])
        if (!active) {
          return
        }
        setSnapshot({ owner, runs: runs ?? [], loop, watches })
        if (runs) {
          const live = new Map(runs.map((run) => [`${run.experiment}/${run.id}`, run]))
          await syncRecordedStatuses(experimentId, live).catch(() => undefined)
        }
      } finally {
        reading = false
      }
    }
    const stop = installWindowVisibilityInterval({
      run: () => void read(),
      intervalMs: anyRunning ? RUNNING_POLL_MS : IDLE_POLL_MS
    })
    return () => {
      active = false
      stop()
    }
  }, [anyRunning, experimentId, owner, runIdsKey, slug, workspacePath])

  return useMemo(() => {
    const statuses = new Map<string, ResearchRunStatusFacts>()
    const watches = new Map<string, string[]>()
    for (const run of current?.runs ?? []) {
      statuses.set(`${run.experiment}/${run.id}`, run)
    }
    for (const watch of current?.watches ?? []) {
      watches.set(watch.run, [...(watches.get(watch.run) ?? []), ...watch.conditions])
    }
    return { statuses, watches, loop: current?.loop ?? null }
  }, [current])
}
