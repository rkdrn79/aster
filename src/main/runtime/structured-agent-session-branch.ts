// Preparing a branch of a structured chat: the host copies the chat's conversation, cut where the
// person chose, and answers the copy's id, which the client's new chat then takes over as it would
// a CLI conversation. The chat itself is never touched.

import {
  agentSessionBranchReach,
  type AgentSessionBranchCopy,
  type AgentSessionBranchParams,
  type AgentSessionBranchResult
} from '../../shared/agent-session-branch'
import { agentSessionProviderHandleChainHead } from '../../shared/agent-session-provider-handle'
import { copyStructuredChatRecordConversation } from '../ai-vault/structured-chat-conversation-copy'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import {
  structuredBranchCut,
  type StructuredBranchCutAnswer
} from '../native-chat/agent-session-wire/structured-branch-cut'
import type { StructuredAgentSessionHistory } from '../native-chat/structured-agent-cli-conversations'
import { structuredAgentRuntimeRegistration } from './structured-agent-runtime-registrations'

/** The parts of the host a branch reads: the chat's record, where its journal cuts, and the
 *  agents' copies. */
export type StructuredAgentSessionBranchHost = {
  branchCut(
    sessionId: string,
    target: { provider: string; nativeId: string | null },
    beforeItemId: string | null
  ): Promise<StructuredBranchCutAnswer>
  deps: {
    store: { getRecord(sessionId: string): AgentSessionRecord | null | undefined }
    adapter: Pick<StructuredAgentSessionAdapter, 'forkForBranch'>
  }
}

export function structuredAgentSessionBranchHost(
  host: Pick<StructuredAgentSessionHost, 'conversationJournal' | 'deps'>
): StructuredAgentSessionBranchHost {
  return {
    deps: host.deps,
    branchCut: async (sessionId, target, beforeItemId) =>
      structuredBranchCut(await host.conversationJournal(sessionId), target, beforeItemId)
  }
}

/** What a branch needs of the agent's registration: that a chat can take a copy over, and the
 *  name its conversation lists under. */
export type StructuredAgentSessionBranchRegistration = {
  transcriptImport?: object | null
  sessionHistory: Pick<StructuredAgentSessionHistory, 'rowSessionId'>
}

export async function prepareStructuredAgentSessionBranch(
  host: StructuredAgentSessionBranchHost,
  params: AgentSessionBranchParams,
  registrationFor: (
    agent: string
  ) => StructuredAgentSessionBranchRegistration | null = structuredAgentRuntimeRegistration
): Promise<AgentSessionBranchResult> {
  const record = host.deps.store.getRecord(params.sessionId)
  if (!record) {
    return { ok: false, reason: 'invalid-target' }
  }
  const reach = agentSessionBranchReach(record.provider)
  const registration = registrationFor(record.provider)
  // The new chat adopts the copy as it would a CLI conversation, so the agent must import one.
  if (!reach || !registration?.transcriptImport) {
    return { ok: false, reason: 'unsupported' }
  }
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)?.handle ?? null
  const answer = await host.branchCut(
    record.sessionId,
    { provider: record.provider, nativeId: head?.nativeId ?? null },
    params.beforeItemId
  )
  if (answer === 'busy') {
    return { ok: false, reason: 'busy' }
  }
  if (!answer) {
    return { ok: false, reason: 'invalid-target' }
  }
  const { cut, keptMessages } = answer
  const copy = await copyConversation()
  return copy.ok ? { ...copy, keptMessages } : copy

  async function copyConversation(): Promise<AgentSessionBranchCopy> {
    if (cut.kind === 'none') {
      return { ok: true, providerSessionId: null }
    }
    if (!head) {
      // Nothing was saved yet: the branch starts as empty as its source.
      return cut.kind === 'all'
        ? { ok: true, providerSessionId: null }
        : { ok: false, reason: 'not-saved' }
    }
    if (reach === 'latest-only') {
      if (cut.kind === 'all') {
        return copyWholeConversation(record!, registration!)
      }
      // Asked for the latest message while a turn runs: the whole conversation is not ready yet.
      return { ok: false, reason: params.beforeItemId === null ? 'busy' : 'latest-only' }
    }
    return (
      (await host.deps.adapter.forkForBranch?.({ record: record!, cut })) ?? {
        ok: false,
        reason: 'unsupported'
      }
    )
  }
}

/** An agent that copies only whole conversations, through its own chat protocol (ACP fork). */
async function copyWholeConversation(
  record: AgentSessionRecord,
  registration: StructuredAgentSessionBranchRegistration
): Promise<AgentSessionBranchCopy> {
  const link = agentSessionProviderHandleChainHead(record.providerHandleChain)
  if (!link) {
    return { ok: false, reason: 'not-saved' }
  }
  try {
    const copied = await copyStructuredChatRecordConversation(
      record,
      registration.sessionHistory.rowSessionId(link)
    )
    return copied.forkedSession
      ? { ok: true, providerSessionId: copied.forkedSession.sessionId }
      : { ok: false, reason: 'provider-refused' }
  } catch {
    return { ok: false, reason: 'provider-refused' }
  }
}
