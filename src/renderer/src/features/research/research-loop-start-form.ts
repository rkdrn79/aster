import type { ResearchExperimentBrief } from '../../../../shared/research/research-experiment-brief'

export type LoopDirection = 'minimize' | 'maximize'

/** What the loop form starts from: the selected Experiment's plan, or blanks without one. */
export type LoopPrefill = {
  objective: string
  metric: string
  direction: LoopDirection
  /** The plan's evaluation split, shown beside the metric since the loop contract has no field. */
  split: string | null
  fromPlan: boolean
}

export function loopPrefillFromBrief(brief: ResearchExperimentBrief | null): LoopPrefill {
  const metric = brief?.primaryMetric
  const objective = brief?.hypothesis?.trim() || brief?.question?.trim() || ''
  return {
    objective,
    metric: metric?.name ?? '',
    direction: metric?.direction ?? 'minimize',
    split: metric?.split ?? brief?.evaluation?.split ?? null,
    fromPlan: Boolean(objective || metric)
  }
}

function joinedList(items: string[]): string {
  return items.length < 3
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

/** Why Start is disabled, as one sentence; null when the loop can start. */
export function loopStartBlocker(input: {
  objective: string
  metric: string
  gpuPolicy: string
  budgetValid: boolean
  hasAgent: boolean
  needsExperimentName: boolean
}): string | null {
  const missing = [
    ...(input.needsExperimentName ? ['an Experiment name'] : []),
    ...(input.objective.trim() ? [] : ['an objective']),
    ...(input.metric.trim() ? [] : ['a primary metric']),
    ...(input.gpuPolicy.trim() ? [] : ['a compute policy']),
    ...(input.budgetValid ? [] : ['a positive run and hour budget'])
  ]
  if (missing.length) {
    return `Add ${joinedList(missing)} to start.`
  }
  return input.hasAgent ? null : 'Choose an agent to start.'
}
