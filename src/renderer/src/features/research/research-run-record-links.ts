import type {
  ResearchDocument,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { selectResearchRun } from '../../../../shared/research/research-selection'
import { catalogRunSourceKey } from './research-catalog-run-import'

export function attachResearchRunRecord(
  document: ResearchDocument,
  run: ResearchRunRecord
): ResearchDocument {
  return selectResearchRun(
    {
      ...document,
      runs: [...document.runs, run],
      detachedCatalogRunSourceKeys: document.detachedCatalogRunSourceKeys.filter(
        (key) => key !== catalogRunSourceKey(run)
      )
    },
    run.id
  )
}

export function detachResearchRun(document: ResearchDocument, runId: string): ResearchDocument {
  const run = document.runs.find((entry) => entry.id === runId)
  if (!run) {
    return document
  }
  const comparisonRunIds = document.comparisonRunIds.filter((id) => id !== runId)
  return {
    ...document,
    runs: document.runs.filter((entry) => entry.id !== runId),
    detachedCatalogRunSourceKeys: [
      ...new Set([...document.detachedCatalogRunSourceKeys, catalogRunSourceKey(run)])
    ],
    selectedRunId: document.selectedRunId === runId ? null : document.selectedRunId,
    experiments: document.experiments.map((experiment) =>
      experiment.lastSelectedRunId === runId
        ? { ...experiment, lastSelectedRunId: null }
        : experiment
    ),
    comparisonRunIds,
    baselineRunId: comparisonRunIds.includes(document.baselineRunId ?? '')
      ? document.baselineRunId
      : (comparisonRunIds[0] ?? null)
  }
}
