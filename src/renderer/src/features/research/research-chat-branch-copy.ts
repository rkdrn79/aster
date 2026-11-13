// What Branch says when it can't run, in one plain line each. Branch makes a new chat and leaves
// this one as it is; Rewind changes this one.

import {
  agentSessionBranchReach,
  type AgentSessionBranchReason
} from '../../../../shared/agent-session-branch'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import type { AgentType } from '../../../../shared/agent-status-types'

export function researchChatBranchReasonCopy(
  reason: AgentSessionBranchReason,
  agent: AgentType
): string {
  const name = formatAgentTypeLabel(agent)
  switch (reason) {
    case 'unsupported':
      return `${name} chats can't branch yet.`
    case 'latest-only':
      return `${name} chats can branch only from the latest message.`
    case 'invalid-target':
      return "A branch can't start at this message. Try the agent's reply before it."
    case 'not-saved':
      return `${name} hasn't saved this chat yet. Try again after it replies.`
    case 'busy':
      return 'Wait for the agent to finish, then branch.'
    case 'provider-refused':
      return `${name} couldn't copy this chat. Nothing was changed.`
  }
}

export const RESEARCH_CHAT_BRANCH_HOST_UPDATE = 'Update Aster on this server to branch its chats.'

/** Why this chat can't branch at all, before anything is asked of its host; null when it can. */
export function researchChatBranchAgentBlock(agent: AgentType): string | null {
  return agentSessionBranchReach(agent) === null
    ? researchChatBranchReasonCopy('unsupported', agent)
    : null
}

/** Why a message other than the latest can't start a branch; null when any message can. */
export function researchChatBranchEarlierBlock(agent: AgentType): string | null {
  return agentSessionBranchReach(agent) === 'latest-only'
    ? researchChatBranchReasonCopy('latest-only', agent)
    : null
}
