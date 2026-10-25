import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type {
  ResearchRunSummary,
  ResearchRunSummaryList
} from '../../../../shared/research/research-run-summary'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { researchErrorText } from './research-error-text'
import { harnessExperimentSlug } from './use-research-harness-experiment'

const POLL_MS = 10_000

export type ResearchRunSummariesState = {
  /** False outside local research/ catalog Experiments and in windows whose preload predates it. */
  available: boolean
  /** Summaries by `<experiment>/<run>` for every catalog Run; null until the Run is organized. */
  byRun: ReadonlyMap<string, ResearchRunSummary | null>
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type Snapshot = {
  owner: string
  runs: ResearchRunSummaryList['runs'] | null
  error: string | null
  signature: string
}

/** The organize bridge, or an empty object when this window's preload predates it. */
export function researchOrganizeBridge(): Partial<Window['api']['researchOrganize']> {
  return window.api.researchOrganize ?? {}
}

/** summary.json of each catalog Run of a local Experiment, re-read every 10 s while visible. */
export function useResearchRunSummaries(
  experiment: ExperimentRecord | undefined
): ResearchRunSummariesState {
  const slug = harnessExperimentSlug(experiment)
  const workspacePath = experiment?.workspacePath ?? null
  const available = Boolean(slug && workspacePath && researchOrganizeBridge().summaries)
  const owner = JSON.stringify([workspacePath, slug])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const readNow = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const { summaries } = researchOrganizeBridge()
    if (!slug || !workspacePath || !summaries) {
      return
    }
    let active = true
    let started = 0
    let inFlight = 0
    const read = async (): Promise<void> => {
      const request = ++started
      inFlight += 1
      const result = await summaries({ workspacePath, experiment: slug }).then(
        (value) => ({ runs: value.runs, error: null }),
        (cause: unknown) => ({ runs: null, error: researchErrorText(cause) })
      )
      inFlight -= 1
      // Why: a poll that started before an organize finished must not overwrite the newer read.
      if (!active || request !== started) {
        return
      }
      setSnapshot((current) => {
        const previous = current?.owner === owner ? current : null
        const runs = result.runs ?? previous?.runs ?? null
        const signature = JSON.stringify([runs, result.error])
        return previous?.signature === signature
          ? previous
          : { owner, runs, error: result.error, signature }
      })
    }
    readNow.current = read
    const stop = installWindowVisibilityInterval({
      run: () => {
        if (inFlight === 0) {
          void read()
        }
      },
      intervalMs: POLL_MS
    })
    return () => {
      active = false
      readNow.current = async () => {}
      stop()
    }
  }, [owner, slug, workspacePath])

  const refresh = useCallback(() => readNow.current(), [])
  const current = snapshot?.owner === owner ? snapshot : null
  return useMemo(
    () => ({
      available,
      byRun: new Map((current?.runs ?? []).map((entry) => [entry.run, entry.summary])),
      loading: available && !current,
      error: current?.error ?? null,
      refresh
    }),
    [available, current, refresh]
  )
}
