import { useEffect, useMemo, useState } from 'react'
import type { ResearchAnalysisItem } from '../../../../shared/research/research-analysis'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { currentAnalyses } from './research-analysis-preview'
import { researchErrorText } from './research-error-text'
import { harnessExperimentSlug } from './use-research-harness-experiment'

const POLL_MS = 15_000
const NO_ITEMS: ResearchAnalysisItem[] = []

/** The analysis bridge, or an empty object when this window's preload predates it. */
export function researchAnalysisBridge(): Partial<Window['api']['researchAnalysis']> {
  return window.api.researchAnalysis ?? {}
}

export type ResearchAnalysesState = {
  /** False outside local research/ catalog Experiments and in windows whose preload predates it. */
  available: boolean
  /** Not superseded, newest first. */
  items: ResearchAnalysisItem[]
  loading: boolean
  error: string | null
}

type Snapshot = {
  owner: string
  items: ResearchAnalysisItem[]
  error: string | null
  signature: string
}

/** analysis.jsonl of a local catalog Experiment, re-read every 15 s while the window is visible. */
export function useResearchAnalyses(
  experiment: ExperimentRecord | undefined
): ResearchAnalysesState {
  const slug = harnessExperimentSlug(experiment)
  const workspacePath = experiment?.workspacePath ?? null
  const available = Boolean(slug && workspacePath && researchAnalysisBridge().list)
  const owner = JSON.stringify([workspacePath, slug])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    const { list } = researchAnalysisBridge()
    if (!slug || !workspacePath || !list) {
      return
    }
    let active = true
    let reading = false
    const read = async (): Promise<void> => {
      if (reading) {
        return
      }
      reading = true
      const result = await list({ workspacePath, experiment: slug }).then(
        (value) => ({ items: currentAnalyses(value.items), error: null }),
        (cause: unknown) => ({ items: null, error: researchErrorText(cause) })
      )
      reading = false
      if (!active) {
        return
      }
      setSnapshot((current) => {
        const previous = current?.owner === owner ? current : null
        const items = result.items ?? previous?.items ?? NO_ITEMS
        const signature = JSON.stringify([items, result.error])
        return previous?.signature === signature
          ? previous
          : { owner, items, error: result.error, signature }
      })
    }
    const stop = installWindowVisibilityInterval({ run: () => void read(), intervalMs: POLL_MS })
    return () => {
      active = false
      stop()
    }
  }, [owner, slug, workspacePath])

  const current = snapshot?.owner === owner ? snapshot : null
  return useMemo(
    () => ({
      available,
      items: current?.items ?? NO_ITEMS,
      loading: available && !current,
      error: current?.error ?? null
    }),
    [available, current]
  )
}
