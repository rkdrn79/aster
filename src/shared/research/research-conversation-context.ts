import type { ExperimentRecord, ResearchDocument } from './research-records'
import { selectResearchExperiment } from './research-selection'

/** The key a project's Writing chat is recorded under in `writingAgentSessionByScope`. */
export function writingAgentScopeKey(scope: { hostId: string; workspaceId: string }): string {
  return JSON.stringify([scope.hostId, scope.workspaceId])
}

/**
 * The Experiment an older per-Experiment Writing chat belonged to. A project's Writing chat is also
 * stamped on every Experiment of its workspace, so it, or a session several carry, belongs to none.
 */
function legacyWritingExperimentId(
  document: ResearchDocument,
  workspaceId: string,
  hostId: string | null,
  sessionId: string | undefined
): string | undefined {
  if (
    !sessionId ||
    (hostId !== null &&
      document.writingAgentSessionByScope[writingAgentScopeKey({ hostId, workspaceId })] ===
        sessionId)
  ) {
    return undefined
  }
  const carriers = document.experiments.filter(
    (experiment) =>
      experiment.writingAgentSessionId === sessionId &&
      experiment.workspaceId === workspaceId &&
      experiment.hostId === hostId
  )
  return carriers.length === 1 ? carriers[0]?.id : undefined
}

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
    : legacyWritingExperimentId(document, workspaceId, hostId, sessionId)
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
