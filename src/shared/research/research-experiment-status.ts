import type { ResearchExperimentStatus } from './research-experiment-brief'
import type { ResearchRunExecutionState } from './research-run-manifest'

export type ResearchExperimentStatusView = {
  status: ResearchExperimentStatus
  /** True when the status follows the Runs and conclusion because the brief was never moved. */
  derived: boolean
}

/**
 * What stage an Experiment is in. A status someone set in the brief wins; a brief left at the
 * default `planned` follows its records: a Run running, Runs to analyze, or a recorded conclusion.
 * Mirrors `derivedExperimentStatus` in the research harness.
 */
export function researchExperimentStatusView(
  brief: { status: ResearchExperimentStatus; conclusion: string | null } | null,
  runStates: readonly ResearchRunExecutionState[]
): ResearchExperimentStatusView {
  const stored = brief?.status ?? 'planned'
  if (stored !== 'planned') {
    return { status: stored, derived: false }
  }
  if (brief?.conclusion?.trim()) {
    return { status: 'concluded', derived: true }
  }
  if (runStates.includes('running')) {
    return { status: 'running', derived: true }
  }
  return runStates.length
    ? { status: 'analyzing', derived: true }
    : { status: stored, derived: false }
}
