// Branch chat from a menu that lists chats (a pane's ⋯, the Chats section): the same branch the
// chat's own menu makes, for a chat that may not be on screen.

import { toast } from 'sonner'
import type { Tab } from '../../../../shared/tab-types'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import { useAppStore } from '@/store'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { waitForChatTab } from './research-window-chat-launch'
import {
  branchResearchChat,
  openResearchChatHere,
  type ResearchChatBranchRequest,
  type ResearchChatBranchSource
} from './research-chat-branch-run'
import { researchChatBranchAgentBlock } from './research-chat-branch-copy'

// A paired server publishes the new chat's tab after it answers.
const BRANCH_TAB_WAIT_MS = 15_000

export function researchChatTabLabel(
  tab: Pick<Tab, 'customLabel' | 'aiVaultTitle' | 'label' | 'agentSessionAgent'>
): string {
  return (
    tab.customLabel ??
    tab.aiVaultTitle?.title ??
    (tab.label || formatAgentTypeLabel(tab.agentSessionAgent))
  )
}

/** What a branch of the chat this tab shows starts from; null for a tab that is no chat. */
export function researchChatBranchSourceForTab(tab: Tab): ResearchChatBranchSource | null {
  if (tab.contentType !== 'agent-session' || !tab.agentSessionAgent || !tab.entityId) {
    return null
  }
  const hostId = structuredAgentSessionOwnerForTab(useAppStore.getState(), tab)
  const target = structuredAgentSessionTargetForHost(hostId)
  return hostId && target
    ? {
        hostId,
        workspaceId: tab.worktreeId,
        sessionId: tab.entityId,
        agent: tab.agentSessionAgent,
        label: researchChatTabLabel(tab),
        target
      }
    : null
}

/** Makes the branch, then opens it with `open` (by default where chats open here). Failures are
 *  said in a toast; nothing is changed by one. */
export async function runResearchChatBranch(
  source: ResearchChatBranchSource,
  request: ResearchChatBranchRequest,
  open?: (sessionId: string) => void
): Promise<string | null> {
  const outcome = await branchResearchChat(source, request)
  if ('error' in outcome) {
    toast.error(outcome.error)
    return null
  }
  await waitForChatTab(source.workspaceId, outcome.sessionId, BRANCH_TAB_WAIT_MS)
  if (open) {
    open(outcome.sessionId)
  } else {
    openResearchChatHere(source, outcome.sessionId)
  }
  return outcome.sessionId
}

/** Branch chat for a tab a list shows: the whole conversation, from its latest finished message. */
export function branchResearchChatTab(tab: Tab, open?: (sessionId: string) => void): void {
  const source = researchChatBranchSourceForTab(tab)
  if (!source) {
    toast.error("This chat can't branch here.")
    return
  }
  const blocked = researchChatBranchAgentBlock(source.agent)
  if (blocked) {
    toast.error(blocked)
    return
  }
  void runResearchChatBranch(source, { at: 'through', beforeItemId: null }, open)
}
