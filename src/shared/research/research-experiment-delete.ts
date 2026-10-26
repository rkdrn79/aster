import type { ResearchDocument } from './research-records'

export function catalogExperimentKey(hostId: string, workspaceId: string, slug: string): string {
  return JSON.stringify([hostId, workspaceId, slug])
}

export function withoutResearchExperiment(
  document: ResearchDocument,
  experimentId: string
): ResearchDocument {
  const target = document.experiments.find((experiment) => experiment.id === experimentId)
  if (!target) {
    return document
  }
  const removedRunIds = new Set(
    document.runs.filter((run) => run.experimentId === experimentId).map((run) => run.id)
  )
  const conversationExperimentIds = Object.fromEntries(
    Object.entries(document.conversationExperimentIds).map(([key, id]) => [
      key,
      id === experimentId ? null : id
    ])
  )
  const conversationHomes = Object.fromEntries(
    Object.entries(document.conversationHomes)
      .filter(([, home]) => home.kind !== 'experiment' || home.experimentId !== experimentId)
      .map(([key, home]) => [
        key,
        home.kind === 'writing' && home.experimentId === experimentId
          ? { ...home, experimentId: null }
          : home
      ])
  )
  const comparisonRunIds = document.comparisonRunIds.filter((id) => !removedRunIds.has(id))
  const removedCatalogExperimentKeys = target.catalogSlug
    ? [
        ...new Set([
          ...document.removedCatalogExperimentKeys,
          catalogExperimentKey(target.hostId, target.workspaceId, target.catalogSlug)
        ])
      ]
    : document.removedCatalogExperimentKeys
  return {
    ...document,
    experiments: document.experiments.filter((experiment) => experiment.id !== experimentId),
    runs: document.runs.filter((run) => run.experimentId !== experimentId),
    papers: document.papers.filter((paper) => paper.experimentId !== experimentId),
    delegations: document.delegations.map((delegation) =>
      delegation.sourceExperimentId === experimentId
        ? { ...delegation, sourceExperimentId: null }
        : delegation
    ),
    conversationExperimentIds,
    conversationHomes,
    selectedExperimentByWorkspace: Object.fromEntries(
      Object.entries(document.selectedExperimentByWorkspace).filter(([, id]) => id !== experimentId)
    ),
    selectedExperimentId:
      document.selectedExperimentId === experimentId ? null : document.selectedExperimentId,
    selectedRunId:
      document.selectedRunId && removedRunIds.has(document.selectedRunId)
        ? null
        : document.selectedRunId,
    comparisonRunIds,
    baselineRunId:
      document.baselineRunId && comparisonRunIds.includes(document.baselineRunId)
        ? document.baselineRunId
        : null,
    removedCatalogExperimentKeys
  }
}
