import type { ExperimentRecord, ResearchDocument } from './research-records'
import { selectResearchExperiment } from './research-selection'

export function conversationExperiment(
  document: ResearchDocument,
  tabId: string,
  workspaceId: string,
  hostId: string | null,
  sessionId?: string
): ExperimentRecord | null {
  const hasExplicitLink = Object.hasOwn(document.conversationExperimentIds, tabId)
  const experimentId = hasExplicitLink
    ? document.conversationExperimentIds[tabId]
    : document.experiments.find(
        (experiment) =>
          sessionId &&
          experiment.writingAgentSessionId === sessionId &&
          experiment.workspaceId === workspaceId &&
          experiment.hostId === hostId
      )?.id
  return (
    document.experiments.find(
      (experiment) =>
        experiment.id === experimentId &&
        experiment.workspaceId === workspaceId &&
        experiment.hostId === hostId
    ) ?? null
  )
}

export function setConversationExperiment(
  document: ResearchDocument,
  tabId: string,
  experimentId: string | null,
  workspaceId: string,
  hostId: string | null
): ResearchDocument {
  const links = { ...document.conversationExperimentIds }
  if (experimentId) {
    const experiment = document.experiments.find(
      (entry) =>
        entry.id === experimentId && entry.workspaceId === workspaceId && entry.hostId === hostId
    )
    if (!experiment) {
      throw new Error('Choose an Experiment in this workspace for the conversation.')
    }
    links[tabId] = experiment.id
  } else {
    links[tabId] = null
  }
  return { ...document, conversationExperimentIds: links }
}

export function selectConversationContext(
  document: ResearchDocument,
  tabId: string,
  workspaceId: string,
  hostId: string | null,
  sessionId?: string
): ResearchDocument {
  const experiment = conversationExperiment(document, tabId, workspaceId, hostId, sessionId)
  const selectionKey = JSON.stringify([hostId, workspaceId])
  const selections = { ...document.selectedExperimentByWorkspace }
  if (experiment) {
    selections[selectionKey] = experiment.id
    return selectResearchExperiment(
      { ...document, selectedExperimentByWorkspace: selections },
      experiment.id
    )
  }
  delete selections[selectionKey]
  return {
    ...document,
    selectedExperimentByWorkspace: selections,
    selectedExperimentId: null,
    selectedRunId: null
  }
}
