import {
  computeResearchGpuBudget,
  projectKeyForSlurmJob,
  type ResearchGpuHostBudget
} from '../../../../shared/research/research-gpu-budget'
import type { ResearchGpuPolicy } from '../../../../shared/research/research-gpu-policy'
import type { ResearchComputeHostInput } from './research-compute-usage'

/** Each read host's budget, filing jobs under projects exactly as the main-process scheduler does. */
export function computeHostGpuBudgets(
  policy: ResearchGpuPolicy,
  hosts: readonly ResearchComputeHostInput[]
): Map<string, ResearchGpuHostBudget> {
  const budgets = new Map<string, ResearchGpuHostBudget>()
  for (const { targetId, sample, workspaces } of hosts) {
    const budget = computeResearchGpuBudget(policy, targetId, sample.slurm.jobs, (job) =>
      projectKeyForSlurmJob(job, workspaces, sample.resolvedWorkspacePaths)
    )
    if (budget) {
      budgets.set(targetId, budget)
    }
  }
  return budgets
}

/** `my-cluster 2/4 GPUs · high`, per host where the project has limits; shown beside its name. */
export function projectBudgetNotes(
  budgets: ReadonlyMap<string, ResearchGpuHostBudget>,
  hostLabel: (targetId: string) => string
): Map<string, string[]> {
  const notes = new Map<string, string[]>()
  for (const budget of budgets.values()) {
    for (const project of budget.projects) {
      const cap = project.maxGpus === null ? '' : `/${project.maxGpus}`
      const note = `${hostLabel(budget.targetId)} ${project.usedGpus}${cap} GPUs · ${project.priority}`
      notes.set(project.projectKey, [...(notes.get(project.projectKey) ?? []), note])
    }
  }
  return notes
}
