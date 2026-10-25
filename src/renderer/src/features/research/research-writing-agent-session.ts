import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { useResearchRecords } from './research-records-store'
import { launchResearchChat } from './ResearchAgentChatPane'
import { researchConversationHomeKey } from './research-conversation-home'
import { writingOwnerExperiment } from './research-writing-project'

/**
 * Binds the project's Writing chat. It is recorded on every Experiment of the project, with the
 * Writing owner as its home, so any selected Experiment hands off to the same chat.
 */
export async function bindWritingAgentSession(
  experiment: ExperimentRecord,
  sessionId: string | null
): Promise<void> {
  await useResearchRecords.getState().update((current) => {
    const scope = { hostId: experiment.hostId, workspaceId: experiment.workspaceId }
    const owner = writingOwnerExperiment(current.experiments, scope)
    if (!owner) {
      throw new Error('The Writing experiment is no longer available.')
    }
    const conversationHomes = { ...current.conversationHomes }
    for (const id of [owner.writingAgentSessionId, sessionId]) {
      if (id) {
        conversationHomes[
          researchConversationHomeKey(experiment.hostId, experiment.workspaceId, id)
        ] = {
          kind: 'writing',
          experimentId: owner.id
        }
      }
    }
    const now = new Date().toISOString()
    return {
      ...current,
      conversationHomes,
      experiments: current.experiments.map((entry) =>
        entry.hostId === scope.hostId && entry.workspaceId === scope.workspaceId
          ? { ...entry, writingAgentSessionId: sessionId || undefined, updatedAt: now }
          : entry
      )
    }
  })
}

/** Starts the project's Writing chat and binds it; an optional first prompt is submitted once ready. */
export async function launchWritingAgent(
  experiment: ExperimentRecord,
  agent: TuiAgent,
  prompt?: string
): Promise<string | null> {
  const result = await launchResearchChat({
    hostId: experiment.hostId,
    workspaceId: experiment.workspaceId,
    agent,
    prompt,
    label: 'Writing agent',
    activate: false
  })
  if ('error' in result) {
    return result.error
  }
  try {
    await bindWritingAgentSession(experiment, result.sessionId)
    return null
  } catch (cause) {
    return `Writing chat started but was not linked. ${String(cause)}`
  }
}
