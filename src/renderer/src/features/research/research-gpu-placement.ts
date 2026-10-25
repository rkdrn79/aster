import {
  decideGpuSubmission,
  type ResearchGpuHostBudget
} from '../../../../shared/research/research-gpu-budget'

export type GpuPlacementCandidate = {
  targetId: string
  label: string
  workDir: string
  budget: ResearchGpuHostBudget | null
}

export type GpuPlacement = GpuPlacementCandidate & {
  held: boolean
  reason: string | null
  availableBudgetGpus: number
}

/** Select only mapped, observed hosts with a configured user budget. Slurm owns physical allocation. */
export function chooseResearchGpuPlacement(
  candidates: readonly GpuPlacementCandidate[],
  projectKey: string,
  gpus: number
): GpuPlacement | null {
  if (!Number.isInteger(gpus) || gpus <= 0) {
    return null
  }
  const choices = candidates.flatMap((candidate) => {
    if (!candidate.budget || !candidate.budget.projects.some((p) => p.projectKey === projectKey)) {
      return []
    }
    const decision = decideGpuSubmission(candidate.budget, projectKey, gpus)
    return [
      {
        ...candidate,
        held: decision.hold,
        reason: decision.reason,
        availableBudgetGpus: Math.max(0, candidate.budget.maxGpus - candidate.budget.usedGpus)
      }
    ]
  })
  choices.sort(
    (a, b) =>
      Number(a.held) - Number(b.held) ||
      b.availableBudgetGpus - a.availableBudgetGpus ||
      a.label.localeCompare(b.label) ||
      a.workDir.localeCompare(b.workDir)
  )
  return choices[0] ?? null
}
