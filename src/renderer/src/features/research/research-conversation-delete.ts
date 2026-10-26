import type { Tab } from '../../../../shared/tab-types'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import type { ResearchLibraryDocument } from '../../../../shared/research/research-library'
import { libraryScopeKey } from '../../../../shared/research/research-library'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import {
  deleteNativeChatComposerDraft,
  structuredAgentSessionDraftScopeKey
} from '@/components/native-chat/native-chat-composer-draft-store'
import { useAppStore } from '@/store'
import { useResearchLibrary } from './research-library-store'
import { useResearchRecords } from './research-records-store'
import { researchConversationHomeKey, writingAgentScopeKey } from './research-conversation-home'

export function withoutResearchConversation(
  document: ResearchDocument,
  tab: Tab,
  hostId: string | null
): ResearchDocument {
  const conversationExperimentIds = { ...document.conversationExperimentIds }
  delete conversationExperimentIds[tab.id]
  const conversationHomes = { ...document.conversationHomes }
  if (hostId && tab.contentType === 'agent-session') {
    delete conversationHomes[researchConversationHomeKey(hostId, tab.worktreeId, tab.entityId)]
  }
  const writingAgentSessionByScope = { ...document.writingAgentSessionByScope }
  if (hostId && tab.contentType === 'agent-session') {
    const scopeKey = writingAgentScopeKey({ hostId, workspaceId: tab.worktreeId })
    if (writingAgentSessionByScope[scopeKey] === tab.entityId) {
      delete writingAgentSessionByScope[scopeKey]
    }
  }
  return {
    ...document,
    conversationExperimentIds,
    conversationHomes,
    writingAgentSessionByScope,
    experiments: document.experiments.map((experiment) =>
      hostId &&
      experiment.hostId === hostId &&
      experiment.workspaceId === tab.worktreeId &&
      experiment.writingAgentSessionId === tab.entityId
        ? { ...experiment, writingAgentSessionId: undefined, updatedAt: new Date().toISOString() }
        : experiment
    )
  }
}

export function withoutReadingConversation(
  document: ResearchLibraryDocument,
  tab: Tab,
  hostId: string | null
): ResearchLibraryDocument {
  if (!hostId || tab.contentType !== 'agent-session') {
    return document
  }
  const key = libraryScopeKey({ hostId, workspaceId: tab.worktreeId })
  if (document.readingAgentSessionByScope[key] !== tab.entityId) {
    return document
  }
  const readingAgentSessionByScope = { ...document.readingAgentSessionByScope }
  delete readingAgentSessionByScope[key]
  return { ...document, readingAgentSessionByScope }
}

export function useDeleteResearchConversation(): (
  tab: Tab,
  hostId: string | null
) => Promise<void> {
  const confirm = useConfirmationDialog()
  return async (tab, hostId) => {
    const label = tab.customLabel ?? tab.aiVaultTitle?.title ?? tab.label
    const accepted = await confirm({
      title: `Delete ${label}?`,
      description:
        'This closes the agent session and removes its Experiment, Writing, and Library links from Aster. The agent provider may still retain its conversation history.',
      confirmLabel: 'Delete',
      confirmVariant: 'destructive'
    })
    if (!accepted) {
      return
    }
    if (
      !(useAppStore.getState().unifiedTabsByWorktree[tab.worktreeId] ?? []).some(
        (entry) => entry.id === tab.id && entry.entityId === tab.entityId
      )
    ) {
      throw new Error('The agent session is no longer open.')
    }
    await Promise.all([useResearchRecords.getState().load(), useResearchLibrary.getState().load()])
    if (!useResearchRecords.getState().document || !useResearchLibrary.getState().document) {
      throw new Error('Research links could not be loaded. The session is still open.')
    }
    await useResearchLibrary
      .getState()
      .update((current) => withoutReadingConversation(current, tab, hostId))
    await useResearchRecords
      .getState()
      .update((current) => withoutResearchConversation(current, tab, hostId))
    if (!useAppStore.getState().closeUnifiedTab(tab.id)) {
      throw new Error('The agent session could not be closed.')
    }
    if (tab.contentType === 'agent-session') {
      deleteNativeChatComposerDraft(structuredAgentSessionDraftScopeKey(tab.entityId))
    }
  }
}
