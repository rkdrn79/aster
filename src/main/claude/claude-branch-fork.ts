import { join } from 'node:path'
import { requireLegacyAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type {
  AgentSessionBranchCut,
  AgentSessionBranchCopy
} from '../../shared/agent-session-branch'
import { agentSessionProviderHandleChainHead } from '../../shared/agent-session-provider-handle'
import { pendingAgentSessionRewindFork } from '../../shared/agent-session-rewind'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { getClaudeProfileRouter } from '../claude-accounts/claude-profile-installed-router'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import { readClaudePromptParentUuid } from './claude-rewind-fork'
import { forkClaudeTranscript } from './claude-rewind-transcript'

/** The conversation the chat's next turn continues: a rewind's fork it has not run yet stands in
 *  for its head. `through` is set only for an older rewind whose copy was left to its launch. */
function currentConversation(
  record: AgentSessionRecord
): { sessionId: string; through?: string } | 'empty' | null {
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)?.handle
  if (!head) {
    return null
  }
  const fork = pendingAgentSessionRewindFork(record.rewind, head.nativeId)
  if (!fork || fork.sessionId === head.nativeId) {
    return { sessionId: head.nativeId }
  }
  if (!fork.throughEntryId) {
    return 'empty'
  }
  return fork.materialized
    ? { sessionId: fork.sessionId }
    : { sessionId: fork.sourceSessionId, through: fork.throughEntryId }
}

/**
 * A copy of a Claude chat's conversation for a branch, through `cut`, written beside its source in
 * whichever Claude home holds it (the chat's account may have changed since). Claude's own fork
 * remaps every entry, so the copy never shares an id with the chat it came from.
 */
export async function forkClaudeConversationForBranch(input: {
  record: AgentSessionRecord
  cut: AgentSessionBranchCut
  claudeConfigDirs: readonly string[]
}): Promise<AgentSessionBranchCopy> {
  const homes = [...new Set(input.claudeConfigDirs)]
  const { cut } = input
  if (cut.kind === 'none') {
    return { ok: true, providerSessionId: null }
  }
  if (cut.kind === 'before-turn') {
    return { ok: false, reason: 'invalid-target' }
  }
  if (cut.kind === 'through-entry') {
    // A turn still runs: the copy keeps what the finished turns wrote, through their last entry.
    for (const claudeConfigDir of homes) {
      const copied = await copyFrom(claudeConfigDir, cut.entry.sessionId, cut.entry.uuid)
      if (copied.ok || copied.reason !== 'not-saved') {
        return copied
      }
    }
    return { ok: false, reason: 'invalid-target' }
  }
  if (cut.kind === 'before-message') {
    for (const claudeConfigDir of homes) {
      const parent = await readClaudePromptParentUuid({
        providerSessionId: cut.beforeMessage.sessionId,
        promptUuid: cut.beforeMessage.uuid,
        claudeConfigDir
      })
      if (parent === undefined) {
        continue
      }
      if (parent === null) {
        // The message opened the conversation: the branch keeps nothing before it.
        return { ok: true, providerSessionId: null }
      }
      return copyFrom(claudeConfigDir, cut.beforeMessage.sessionId, parent)
    }
    return { ok: false, reason: 'invalid-target' }
  }
  const conversation = currentConversation(input.record)
  if (conversation === 'empty') {
    return { ok: true, providerSessionId: null }
  }
  if (!conversation) {
    return { ok: false, reason: 'not-saved' }
  }
  for (const claudeConfigDir of homes) {
    const copied = await copyFrom(claudeConfigDir, conversation.sessionId, conversation.through)
    if (copied.ok || copied.reason !== 'not-saved') {
      return copied
    }
  }
  return { ok: false, reason: 'not-saved' }
}

async function copyFrom(
  claudeConfigDir: string,
  sourceSessionId: string,
  through: string | undefined
): Promise<AgentSessionBranchCopy> {
  const sourcePath = await resolveSessionFilePath('claude', sourceSessionId, {
    claudeProjectsDir: join(claudeConfigDir, 'projects'),
    strictErrors: true
  })
  if (!sourcePath) {
    return { ok: false, reason: 'not-saved' }
  }
  const copy = await forkClaudeTranscript(sourcePath, sourceSessionId, through)
  return copy.resumeCursor
    ? { ok: true, providerSessionId: copy.sessionId }
    : { ok: false, reason: 'not-saved' }
}

/** The adapter's answer, searching every Claude home Aster knows, the chat's own first. */
export const claudeForkForBranch: NonNullable<StructuredAgentSessionAdapter['forkForBranch']> = ({
  record,
  cut
}) => {
  const router = getClaudeProfileRouter()
  return forkClaudeConversationForBranch({
    record,
    cut,
    claudeConfigDirs: [
      requireLegacyAgentSessionAccountHome(record.accountHome).path,
      ...(router ? [...router.accountHomes(), router.systemDefaultHome()] : [])
    ]
  })
}
