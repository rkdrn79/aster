import { useCallback, useEffect, useMemo, useState } from 'react'
import { researchErrorText } from '@/features/research/research-error-text'
import {
  approveBlockers,
  approveInput,
  cutSet,
  EMPTY_SELECTION,
  initialSelection,
  proposedSummary,
  type PlanSelection
} from '@/features/research/research-plan-view-state'
import {
  approveHostPlan,
  isOldHostError,
  readHostPlanOverview,
  stateHostPlanBudget
} from '@/web/web-research-decisions'
import { tierTotals, type PlanTierTotals } from '../../../research-harness/research-plan-view.mjs'
import type { ResearchPlanOverview } from '../../../shared/research/research-plans'
import { refreshPhoneDecisions } from './phone-research-decisions'

export type PhonePlanState = {
  overview: ResearchPlanOverview | null
  status: 'loading' | 'ready' | 'update-needed' | 'error'
  error: string | null
  selection: PlanSelection
  setSelection: (next: PlanSelection) => void
  /** Kept cells against the stated compute, recomputed as cells are cut. */
  totals: PlanTierTotals | null
  blockers: string[]
  busy: 'budget' | 'approve' | null
  approved: string | null
  stateBudget: (gpuHours: number) => Promise<void>
  approve: () => Promise<void>
}

/** One plan's overview from the host, the person's cuts, compute and approval. */
export function usePhonePlan(worktreeId: string, plan: string): PhonePlanState {
  const [overview, setOverview] = useState<ResearchPlanOverview | null>(null)
  const [status, setStatus] = useState<PhonePlanState['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<PlanSelection>(EMPTY_SELECTION)
  const [busy, setBusy] = useState<PhonePlanState['busy']>(null)
  const [approved, setApproved] = useState<string | null>(null)

  const load = useCallback(
    async (keepSelection: boolean): Promise<void> => {
      try {
        const read = await readHostPlanOverview(worktreeId, plan)
        setOverview(read)
        setStatus('ready')
        if (!keepSelection) {
          setSelection(initialSelection(read))
        }
      } catch (cause) {
        setStatus(isOldHostError(cause) ? 'update-needed' : 'error')
        setError(researchErrorText(cause))
      }
    },
    [worktreeId, plan]
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const totals = useMemo(
    () => (overview ? tierTotals(overview.document, cutSet(selection)) : null),
    [overview, selection]
  )
  const blockers = overview && totals ? approveBlockers(overview, selection, totals) : []

  const stateBudget = async (gpuHours: number): Promise<void> => {
    setBusy('budget')
    setError(null)
    try {
      await stateHostPlanBudget(worktreeId, plan, gpuHours)
      // Why keep: stating compute bumps the revision but leaves the person's cuts as chosen.
      await load(true)
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setBusy(null)
    }
  }

  const approve = async (): Promise<void> => {
    if (!overview || blockers.length) {
      return
    }
    setBusy('approve')
    setError(null)
    try {
      const result = await approveHostPlan(worktreeId, plan, approveInput(overview, selection))
      setApproved(proposedSummary(result.proposals))
      await load(false)
      void refreshPhoneDecisions(worktreeId, true)
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setBusy(null)
    }
  }

  return {
    overview,
    status,
    error,
    selection,
    setSelection,
    totals,
    blockers,
    busy,
    approved,
    stateBudget,
    approve
  }
}
