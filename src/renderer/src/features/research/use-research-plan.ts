import { useCallback, useEffect, useRef, useState } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import type {
  ResearchPlanApproveInput,
  ResearchPlanApproveResult,
  ResearchPlanOverview,
  ResearchPlanStageResult,
  ResearchPlanSummary
} from '../../../../shared/research/research-plans'
import { researchErrorText } from './research-error-text'

const POLL_MS = 10_000

export type ResearchPlanState = {
  /** False when this build's preload has no Plan API. */
  available: boolean
  loading: boolean
  plans: ResearchPlanSummary[]
  selected: string | null
  select: (plan: string) => void
  overview: ResearchPlanOverview | null
  error: string | null
  refresh: () => Promise<void>
  stateBudget: (gpuHours: number) => Promise<void>
  approve: (input: ResearchPlanApproveInput) => Promise<ResearchPlanApproveResult>
  proposeStage: (stage: string) => Promise<ResearchPlanStageResult>
}

function plansApi() {
  return window.api.researchPlans ?? null
}

/** The project's plans and the chosen plan's overview, re-read every 10 s while visible. */
export function useResearchPlan(workspacePath: string | null): ResearchPlanState {
  const [plans, setPlans] = useState<ResearchPlanSummary[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [overview, setOverview] = useState<ResearchPlanOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen
  const available = Boolean(plansApi())
  const selected = plans.some((plan) => plan.id === chosen) ? chosen : (plans[0]?.id ?? null)

  const read = useCallback(async (): Promise<void> => {
    const api = plansApi()
    if (!api || !workspacePath) {
      setLoading(false)
      return
    }
    try {
      const listed = await api.list({ workspacePath })
      setPlans(listed.plans)
      const target = listed.plans.some((plan) => plan.id === chosenRef.current)
        ? chosenRef.current
        : (listed.plans[0]?.id ?? null)
      setOverview(target ? await api.overview({ workspacePath, plan: target }) : null)
      setError(null)
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setLoading(false)
    }
  }, [workspacePath])

  useEffect(() => {
    let reading = false
    const run = (): void => {
      if (reading) {
        return
      }
      reading = true
      void read().finally(() => {
        reading = false
      })
    }
    run()
    return installWindowVisibilityInterval({ run, intervalMs: POLL_MS })
  }, [read])

  const select = useCallback(
    (plan: string) => {
      chosenRef.current = plan
      setChosen(plan)
      void read()
    },
    [read]
  )

  const stateBudget = useCallback(
    async (gpuHours: number): Promise<void> => {
      const api = plansApi()
      if (!api || !workspacePath || !selected) {
        return
      }
      await api.budget({ workspacePath, plan: selected, gpuHours })
      await read()
    },
    [read, selected, workspacePath]
  )

  const approve = useCallback(
    async (input: ResearchPlanApproveInput): Promise<ResearchPlanApproveResult> => {
      const api = plansApi()
      if (!api || !workspacePath || !selected) {
        throw new Error('This build cannot approve plans.')
      }
      const result = await api.approve({ workspacePath, plan: selected, ...input })
      await read()
      return result
    },
    [read, selected, workspacePath]
  )

  const proposeStage = useCallback(
    async (stage: string): Promise<ResearchPlanStageResult> => {
      const api = plansApi()
      if (!api || !workspacePath || !selected) {
        throw new Error('This build cannot propose plan stages.')
      }
      const result = await api.proposeStage({ workspacePath, plan: selected, stage })
      await read()
      return result
    },
    [read, selected, workspacePath]
  )

  return {
    available,
    loading,
    plans,
    selected,
    select,
    overview: overview && overview.plan.id === selected ? overview : null,
    error,
    refresh: read,
    stateBudget,
    approve,
    proposeStage
  }
}
