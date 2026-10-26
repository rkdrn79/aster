import type { ResearchDocument } from '../../../../shared/research/research-records'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { useResearchRecords } from './research-records-store'
import { researchConversationHomeKey, writingAgentScopeKey } from './research-conversation-home'
import { writingOwnerExperiment } from './research-writing-project'

type WritingAgentScope = { hostId: string; workspaceId: string }

/** Binds a project's Writing chat, including projects that have no Experiment yet. */
export async function bindWritingAgentSession(
  scope: WritingAgentScope,
  sessionId: string | null
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((current) => withWritingAgentSession(current, scope, sessionId))
}

export function withWritingAgentSession(
  current: ResearchDocument,
  scope: WritingAgentScope,
  sessionId: string | null
): ResearchDocument {
  const owner = writingOwnerExperiment(current.experiments, scope)
  const scopeKey = writingAgentScopeKey(scope)
  const writingAgentSessionByScope = { ...current.writingAgentSessionByScope }
  const previousSessionId = writingAgentSessionByScope[scopeKey] ?? owner?.writingAgentSessionId
  if (sessionId) {
    writingAgentSessionByScope[scopeKey] = sessionId
  } else {
    delete writingAgentSessionByScope[scopeKey]
  }
  const conversationHomes = { ...current.conversationHomes }
  for (const id of [previousSessionId, sessionId]) {
    if (id) {
      conversationHomes[researchConversationHomeKey(scope.hostId, scope.workspaceId, id)] = {
        kind: 'writing',
        experimentId: null
      }
    }
  }
  const now = new Date().toISOString()
  return {
    ...current,
    conversationHomes,
    writingAgentSessionByScope,
    experiments: current.experiments.map((entry) =>
      entry.hostId === scope.hostId && entry.workspaceId === scope.workspaceId
        ? { ...entry, writingAgentSessionId: sessionId || undefined, updatedAt: now }
        : entry
    )
  }
}

/** Starts the project's Writing chat and binds it; an optional first prompt is submitted once ready. */
export async function launchWritingAgent(
  scope: WritingAgentScope,
  agent: TuiAgent,
  prompt?: string
): Promise<string | null> {
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  const result = await launchResearchChat({
    hostId: scope.hostId,
    workspaceId: scope.workspaceId,
    agent,
    prompt,
    label: 'Writing agent',
    activate: false
  })
  if ('error' in result) {
    return result.error
  }
  try {
    await bindWritingAgentSession(scope, result.sessionId)
    return null
  } catch (cause) {
    return `Writing chat started but was not linked. ${String(cause)}`
  }
}
