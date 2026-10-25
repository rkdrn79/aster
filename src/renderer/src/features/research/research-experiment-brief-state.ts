import { useCallback, useEffect, useMemo, useState } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type {
  ResearchExperimentBrief,
  ResearchExperimentBriefPatch
} from '../../../../shared/research/research-experiment-brief'
import { researchErrorText } from './research-error-text'
import { harnessExperimentSlug } from './use-research-harness-experiment'

// Why poll: agents edit the brief with `brief set` while the Experiment is open.
const REFRESH_MS = 60_000

/** The brief bridge, or an empty object when this window's preload predates it. */
function briefBridge(): Partial<Window['api']['researchBrief']> {
  return window.api.researchBrief ?? {}
}

export type ExperimentBriefState = {
  /** A local research/ catalog Experiment in a window that can read briefs. */
  available: boolean
  loaded: boolean
  brief: ResearchExperimentBrief | null
  error: string | null
  read: () => Promise<void>
  /** Writes only the given fields, then re-reads; throws what the harness refused. */
  update: (patch: ResearchExperimentBriefPatch) => Promise<void>
}

type BriefSnapshot = { owner: string; brief: ResearchExperimentBrief | null; error: string | null }

/** The Experiment's brief from experiment.json, re-read every minute while the window is visible. */
export function useExperimentBrief(experiment: ExperimentRecord | undefined): ExperimentBriefState {
  const slug = harnessExperimentSlug(experiment)
  const workspacePath = experiment?.workspacePath ?? null
  const owner = JSON.stringify([workspacePath, slug])
  const [snapshot, setSnapshot] = useState<BriefSnapshot | null>(null)
  const available = Boolean(slug && workspacePath && briefBridge().show && briefBridge().update)

  const read = useCallback(async (): Promise<void> => {
    const { show } = briefBridge()
    if (!slug || !workspacePath || !show) {
      return
    }
    try {
      const result = await show({ workspacePath, experiment: slug })
      setSnapshot({ owner, brief: result.brief, error: null })
    } catch (cause) {
      setSnapshot((current) => ({
        owner,
        brief: current?.owner === owner ? current.brief : null,
        error: researchErrorText(cause)
      }))
    }
  }, [owner, slug, workspacePath])

  useEffect(
    () => installWindowVisibilityInterval({ run: () => void read(), intervalMs: REFRESH_MS }),
    [read]
  )

  const update = useCallback(
    async (patch: ResearchExperimentBriefPatch): Promise<void> => {
      const write = briefBridge().update
      if (!slug || !workspacePath || !write) {
        throw new Error('Briefs are available for local research/ catalog projects.')
      }
      await write({ workspacePath, experiment: slug, patch })
      await read()
    },
    [read, slug, workspacePath]
  )

  const current = snapshot?.owner === owner ? snapshot : null
  return useMemo(
    () => ({
      available,
      loaded: current !== null,
      brief: current?.brief ?? null,
      error: current?.error ?? null,
      read,
      update
    }),
    [available, current, read, update]
  )
}
