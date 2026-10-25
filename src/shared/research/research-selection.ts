import type { ResearchDocument } from './research-records'

export function selectResearchExperiment(
  document: ResearchDocument,
  experimentId: string
): ResearchDocument {
  const target = document.experiments.find((experiment) => experiment.id === experimentId)
  if (!target) {
    return document
  }
  const previousRun = document.runs.find(
    (run) => run.id === document.selectedRunId && run.experimentId === document.selectedExperimentId
  )
  const experiments = document.experiments.map((experiment) =>
    experiment.id === document.selectedExperimentId && previousRun
      ? { ...experiment, lastSelectedRunId: previousRun.id }
      : experiment
  )
  const preferredId =
    experimentId === document.selectedExperimentId
      ? (previousRun?.id ?? target.lastSelectedRunId)
      : target.lastSelectedRunId
  const selectedRun =
    document.runs.find((run) => run.id === preferredId && run.experimentId === experimentId) ??
    document.runs.find((run) => run.experimentId === experimentId)
  return {
    ...document,
    experiments,
    selectedExperimentId: experimentId,
    selectedRunId: selectedRun?.id ?? null
  }
}

export function selectResearchRun(document: ResearchDocument, runId: string): ResearchDocument {
  const run = document.runs.find(
    (entry) => entry.id === runId && entry.experimentId === document.selectedExperimentId
  )
  if (!run) {
    return document
  }
  return {
    ...document,
    selectedRunId: runId,
    experiments: document.experiments.map((experiment) =>
      experiment.id === run.experimentId ? { ...experiment, lastSelectedRunId: runId } : experiment
    )
  }
}
