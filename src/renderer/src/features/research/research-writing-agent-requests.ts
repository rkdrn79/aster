import { sendMessageToAgent } from '@/lib/agent-message-send'
import { structuredAgentSessionOwnerForTab } from '@/runtime/structured-agent-session-owner'
import { useAppStore } from '@/store'
import type {
  ExperimentRecord,
  ResearchDocument
} from '../../../../shared/research/research-records'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { reviewChatAgent } from './research-agent-review-launch'
import { writingAgentScopeKey } from './research-conversation-home'
import { useResearchRecords } from './research-records-store'
import { validateWritingAgentBinding } from './research-writing-agent-binding'
import type { WritingMessageContext, WritingPromptContext } from './research-writing-agent-prompts'
import { launchWritingAgent } from './research-writing-agent-session'
import { resolveManuscriptFile } from './research-writing-source'

export type WritingRecord = Pick<
  ExperimentRecord,
  'hostId' | 'workspaceId' | 'workspacePath' | 'manuscript' | 'writingAgentSessionId'
>

/** Absolute paths the Writing prompts name, on the host that holds the project. */
export function writingPromptContext(record: WritingRecord): WritingPromptContext {
  let manuscriptPath: string | null = null
  if (record.manuscript) {
    try {
      manuscriptPath = resolveManuscriptFile(
        record,
        record.manuscript.sourcePath,
        '.tex'
      ).absolutePath
    } catch {
      manuscriptPath = null
    }
  }
  return { projectPath: record.workspacePath, manuscriptPath }
}

/** The project's Writing chat: the scope's binding, else the owner Experiment's older one. */
export function boundWritingSessionId(
  document: ResearchDocument | null,
  record: WritingRecord
): string | undefined {
  return (
    document?.writingAgentSessionByScope[
      writingAgentScopeKey({ hostId: record.hostId, workspaceId: record.workspaceId })
    ] ?? record.writingAgentSessionId
  )
}

// Why per chat: the agent keeps the context it was given; a new chat or another manuscript needs it again.
const contextSentBySession = new Map<string, string>()

export function noteWritingContextSent(sessionId: string, key: string): void {
  contextSentBySession.set(sessionId, key)
}

/**
 * What a message typed in the Writing chat sends: the Writing context block on the first message
 * of the chat and whenever the manuscript changed since; plain text otherwise.
 */
export function withWritingMessageContext(
  sessionId: string,
  text: string,
  context: WritingMessageContext | null
): string {
  if (!context || !text.trim() || text.startsWith('/')) {
    return text
  }
  if (contextSentBySession.get(sessionId) === context.key) {
    return text
  }
  noteWritingContextSent(sessionId, context.key)
  return withAsterContext(text, { label: context.label, body: context.body })
}

function sendFailureText(status: string): string {
  switch (status) {
    case 'not-ready':
      return 'The Writing chat is still starting. Try again shortly.'
    case 'unconfirmed':
      return 'Delivery could not be confirmed. Check the chat before retrying.'
    default:
      return 'The Writing chat did not accept the request.'
  }
}

/**
 * Sends a prompt to the project's bound Writing chat, or starts one with it when none is open.
 * `contextKey` marks the Writing context as delivered, so the next typed message stays plain.
 * Resolves to an error message, or null once delivered.
 */
export async function sendWritingPrompt(
  record: WritingRecord,
  prompt: string,
  contextKey?: string
): Promise<string | null> {
  const sessionId = boundWritingSessionId(useResearchRecords.getState().document, record)
  const state = useAppStore.getState()
  const tab = sessionId
    ? (state.unifiedTabsByWorktree[record.workspaceId] ?? []).find(
        (candidate) => candidate.entityId === sessionId
      )
    : undefined
  const check = validateWritingAgentBinding({
    experiment: record,
    boundSessionId: sessionId,
    currentWorkspaceId: record.workspaceId,
    currentHostId: record.hostId,
    tab,
    tabOwnerHostId: tab ? structuredAgentSessionOwnerForTab(state, tab) : null
  })
  if (!check.ok) {
    const failure = await launchWritingAgent(record, reviewChatAgent(), prompt)
    const launched = boundWritingSessionId(useResearchRecords.getState().document, record)
    if (!failure && launched && contextKey) {
      noteWritingContextSent(launched, contextKey)
    }
    return failure
  }
  const result = await sendMessageToAgent({
    worktreeId: record.workspaceId,
    target: { kind: 'structured-session', sessionId: check.binding.sessionId },
    prompt
  })
  if (result.status !== 'sent') {
    return sendFailureText(result.status)
  }
  if (contextKey) {
    noteWritingContextSent(check.binding.sessionId, contextKey)
  }
  return null
}
