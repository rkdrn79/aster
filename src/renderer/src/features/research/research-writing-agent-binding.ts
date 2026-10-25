import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { Tab } from '../../../../shared/tab-types'
import { isStructuredTab } from '../../../../shared/structured-agent-session-tab'

type WritingChatTab = Pick<
  Tab,
  'id' | 'entityId' | 'worktreeId' | 'contentType' | 'agentSessionAgent'
>

export type WritingAgentBinding = { sessionId: string; tabId: string }
export type WritingAgentBindingCheck =
  | { ok: true; binding: WritingAgentBinding }
  | {
      ok: false
      reason:
        | 'no-binding'
        | 'workspace-changed'
        | 'host-changed'
        | 'chat-closed'
        | 'chat-owner-changed'
    }

/**
 * A manuscript request may only target the explicit chat in the project's current workspace.
 * The caller resolves legacy tab ownership using the app's authority-aware host selector first.
 */
export function validateWritingAgentBinding(input: {
  experiment: Pick<ExperimentRecord, 'workspaceId' | 'hostId'>
  boundSessionId: string | null | undefined
  currentWorkspaceId: string | null | undefined
  currentHostId: string | null | undefined
  tab: WritingChatTab | null | undefined
  tabOwnerHostId: string | null | undefined
}): WritingAgentBindingCheck {
  const sessionId = input.boundSessionId?.trim()
  if (!sessionId) {
    return { ok: false, reason: 'no-binding' }
  }
  if (input.currentWorkspaceId !== input.experiment.workspaceId) {
    return { ok: false, reason: 'workspace-changed' }
  }
  if (input.currentHostId !== input.experiment.hostId) {
    return { ok: false, reason: 'host-changed' }
  }
  if (
    !input.tab ||
    !isStructuredTab(input.tab) ||
    input.tab.entityId !== sessionId ||
    input.tab.worktreeId !== input.experiment.workspaceId
  ) {
    return { ok: false, reason: 'chat-closed' }
  }
  if (input.tabOwnerHostId !== input.experiment.hostId) {
    return { ok: false, reason: 'chat-owner-changed' }
  }
  return { ok: true, binding: { sessionId, tabId: input.tab.id } }
}

export function writingAgentBindingError(
  reason: Exclude<WritingAgentBindingCheck, { ok: true }>['reason']
): string {
  switch (reason) {
    case 'no-binding':
      return 'Choose a Writing agent chat before sending this revision.'
    case 'workspace-changed':
      return 'The active workspace changed. Return to this manuscript workspace.'
    case 'host-changed':
      return 'The active host changed. Return to the host that owns this manuscript.'
    case 'chat-closed':
      return 'The bound Writing chat is no longer open. Choose another chat.'
    case 'chat-owner-changed':
      return 'The Writing chat belongs to another host. Choose a chat on this host.'
  }
}
