import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { researchErrorText } from './research-error-text'
import { openFindingsByRun } from './research-findings-format'
import { harnessExperimentSlug } from './use-research-harness-experiment'

const POLL_MS = 10_000
const NO_FINDINGS: ResearchFinding[] = []

export type ResearchFindingsState = {
  /** False outside local research/ catalog Experiments and in windows whose preload predates it. */
  available: boolean
  /** Every status; the panel filters. */
  findings: ResearchFinding[]
  /** Open findings by `<experiment>/<run>` reference. */
  byRun: ReadonlyMap<string, ResearchFinding[]>
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type Snapshot = {
  owner: string
  findings: ResearchFinding[]
  error: string | null
  signature: string
}

/** The findings bridge, or an empty object when this window's preload predates it. */
export function researchFindingsBridge(): Partial<Window['api']['researchFindings']> {
  return window.api.researchFindings ?? {}
}

/** Rule and recorded findings of a local catalog Experiment, re-read every 10 s while visible. */
export function useResearchFindings(
  experiment: ExperimentRecord | undefined
): ResearchFindingsState {
  const slug = harnessExperimentSlug(experiment)
  const workspacePath = experiment?.workspacePath ?? null
  const available = Boolean(slug && workspacePath && researchFindingsBridge().list)
  const owner = JSON.stringify([workspacePath, slug])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const readNow = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const { list } = researchFindingsBridge()
    if (!slug || !workspacePath || !list) {
      return
    }
    let active = true
    let started = 0
    let inFlight = 0
    const read = async (): Promise<void> => {
      const request = ++started
      inFlight += 1
      const result = await list({ workspacePath, experiment: slug, status: 'all' }).then(
        (value) => ({ findings: value.findings, error: null }),
        (cause: unknown) => ({ findings: null, error: researchErrorText(cause) })
      )
      inFlight -= 1
      // Why: a poll that started before a status change must not overwrite the newer read.
      if (!active || request !== started) {
        return
      }
      setSnapshot((current) => {
        const previous = current?.owner === owner ? current : null
        const findings = result.findings ?? previous?.findings ?? NO_FINDINGS
        const signature = JSON.stringify([findings, result.error])
        return previous?.signature === signature
          ? previous
          : { owner, findings, error: result.error, signature }
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
  return useMemo(() => {
    const findings = current?.findings ?? NO_FINDINGS
    return {
      available,
      findings,
      byRun: openFindingsByRun(findings),
      loading: available && !current,
      error: current?.error ?? null,
      refresh
    }
  }, [available, current, refresh])
}
