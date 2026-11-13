// Making a branch: the chat's host copies its conversation up to the chosen message, a new chat
// takes the copy over, and the research document remembers which chat it came from. The chat the
// branch came from is never changed.

import { useSyncExternalStore } from 'react'
import type { AgentJournalMessageItem } from '../../../../shared/agent-session-journal-types'
import type { AgentType } from '../../../../shared/agent-status-types'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import {
  prepareStructuredAgentSessionBranch,
  supportsStructuredAgentSessionBranch
} from '@/runtime/structured-agent-session-branch-client'
import { structuredAgentSessionDraftScopeKey } from '@/components/native-chat/native-chat-composer-draft-store'
import { returnMessageToComposer } from '@/components/native-chat/structured-agent-session-message-hand-back'
import { useResearchRecords } from './research-records-store'
import {
  researchChatBranchFamily,
  researchChatBranchName,
  withResearchChatBranch,
  type ResearchChatScope
} from './research-chat-branches'
import {
  RESEARCH_CHAT_BRANCH_HOST_UPDATE,
  researchChatBranchReasonCopy
} from './research-chat-branch-copy'
import { launchResearchChat } from './research-chat-launch'
import { openChatInResearchWindow, researchWindowSurfaceTarget } from './research-window-surface'

export type ResearchChatBranchSource = ResearchChatScope & {
  sessionId: string
  agent: AgentType
  /** The chat's name as it shows now; the branch is named after it. */
  label: string
  target: RuntimeClientTarget
}

/**
 * Where the branch is made. `through`: the branch keeps everything before `beforeItemId` (all of
 * the chat when null), so it ends at the agent's reply. `message`: it keeps everything before the
 * person's message `beforeItemId`, which `edit` puts back in its composer or `resend` asks again.
 */
export type ResearchChatBranchRequest =
  | { at: 'through'; beforeItemId: string | null }
  | {
      at: 'message'
      beforeItemId: string
      edit?: { itemId: string; blocks: AgentJournalMessageItem['blocks'] }
      resend?: string
    }

export type ResearchChatBranchOutcome = { sessionId: string } | { error: string }

const pending = new Set<string>()
const listeners = new Set<() => void>()
const changed = (): void => listeners.forEach((listener) => listener())
const pendingKey = (source: ResearchChatScope & { sessionId: string }): string =>
  JSON.stringify([source.hostId, source.workspaceId, source.sessionId])

/** Whether a branch of this chat is being made right now. */
export function useResearchChatBranchPending(
  source: (ResearchChatScope & { sessionId: string }) | null
): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (source ? pending.has(pendingKey(source)) : false),
    () => false
  )
}

/** The message's own words: Aster's machine context is added again when the branch sends it. */
function editableBlocks(
  blocks: AgentJournalMessageItem['blocks']
): AgentJournalMessageItem['blocks'] {
  return blocks.map((block) =>
    block.type === 'text'
      ? { ...block, text: splitAsterContext(block.text)?.request ?? block.text }
      : block
  )
}

export async function branchResearchChat(
  source: ResearchChatBranchSource,
  request: ResearchChatBranchRequest
): Promise<ResearchChatBranchOutcome> {
  const key = pendingKey(source)
  if (pending.has(key)) {
    return { error: 'A branch of this chat is already being made.' }
  }
  if (!isTuiAgent(source.agent)) {
    return { error: researchChatBranchReasonCopy('unsupported', source.agent) }
  }
  const agent = source.agent
  pending.add(key)
  changed()
  try {
    if (!(await supportsStructuredAgentSessionBranch(source.target))) {
      return { error: RESEARCH_CHAT_BRANCH_HOST_UPDATE }
    }
    const prepared = await prepareStructuredAgentSessionBranch(source.target, {
      sessionId: source.sessionId,
      beforeItemId: request.beforeItemId
    })
    if (!prepared.ok) {
      return { error: researchChatBranchReasonCopy(prepared.reason, agent) }
    }
    await useResearchRecords.getState().load()
    const family = researchChatBranchFamily(
      useResearchRecords.getState().document,
      source,
      source.sessionId
    )
    const resend = request.at === 'message' ? request.resend : undefined
    const launched = await launchResearchChat({
      hostId: source.hostId,
      workspaceId: source.workspaceId,
      agent,
      label: researchChatBranchName(source.label, family.length),
      activate: false,
      ...(prepared.providerSessionId
        ? { resumeFrom: { providerSessionId: prepared.providerSessionId } }
        : {}),
      ...(resend ? { prompt: resend } : {})
    })
    if ('error' in launched) {
      return launched
    }
    if (request.at === 'message' && request.edit) {
      returnMessageToComposer(
        structuredAgentSessionDraftScopeKey(launched.sessionId),
        `branched-${request.edit.itemId}`,
        editableBlocks(request.edit.blocks)
      )
    }
    await useResearchRecords.getState().update((document) =>
      withResearchChatBranch(document, source, launched.sessionId, {
        parentSessionId: source.sessionId,
        // `through` names the last message it keeps; `message`, the person's message it starts at.
        messageNumber: prepared.keptMessages + (request.at === 'message' ? 1 : 0),
        createdAt: new Date().toISOString()
      })
    )
    return launched
  } catch (cause) {
    return {
      error: `The branch could not be made. ${cause instanceof Error ? cause.message : String(cause)}`
    }
  } finally {
    pending.delete(key)
    changed()
  }
}

/** Opens a chat of this workspace where chats open here: a project window's Chats, else the
 *  Workbench. False when its tab is not here (yet). */
export function openResearchChatHere(scope: ResearchChatScope, sessionId: string): boolean {
  const state = useAppStore.getState()
  const tab = (state.unifiedTabsByWorktree[scope.workspaceId] ?? []).find(
    (candidate) => candidate.entityId === sessionId
  )
  if (!tab) {
    return false
  }
  if (researchWindowSurfaceTarget()) {
    return openChatInResearchWindow(scope.workspaceId, tab.id)
  }
  const executionHostId = tab.executionHostId ?? normalizeExecutionHostId(scope.hostId)
  if (
    activateAndRevealWorkspace(
      scope.workspaceId,
      executionHostId ? { executionHostId } : undefined
    ) === false
  ) {
    return false
  }
  state.activateTab(tab.id, { worktreeId: scope.workspaceId })
  return true
}
