// A subtask's result, read from its own chat: what the agent wrote after the subtask's prompt, and
// the message that hands it back to the chat the subtask came from.

import { withAsterContext } from '../../../../shared/aster-context-block'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { AgentSessionHistoryResult } from '../../../../shared/agent-session-wire'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

/** Every subtask prompt starts so (`researchSubtaskPrompt`). */
export const RESEARCH_SUBTASK_PROMPT_PREFIX = 'Subtask:'
/** The result an agent gets back is bounded, as any message Aster writes for it is. */
const RESULT_LIMIT = 12_000
const HISTORY_TAIL = 200

function messageText(item: AgentJournalRenderItem): string {
  return item.body.kind === 'message'
    ? item.body.blocks
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
        .trim()
    : ''
}

/** What the agent answered the subtask's prompt with, once it has; null before then. */
export function researchSubtaskResultFromItems(
  items: readonly AgentJournalRenderItem[]
): string | null {
  const main = items.filter((item) => item.agentId === undefined && item.body.kind === 'message')
  const prompt = main.findLastIndex(
    (item) => item.body.kind === 'message' && item.body.role === 'user'
  )
  if (prompt === -1 || !messageText(main[prompt]!).startsWith(RESEARCH_SUBTASK_PROMPT_PREFIX)) {
    return null
  }
  const answer = main
    .slice(prompt + 1)
    .filter((item) => item.body.kind === 'message' && item.body.role === 'assistant')
    .map(messageText)
    .filter(Boolean)
    .join('\n\n')
  if (!answer) {
    return null
  }
  return answer.length > RESULT_LIMIT
    ? `${answer.slice(0, RESULT_LIMIT)}\n\n[Result shortened]`
    : answer
}

/** The subtask's result from its host, or null when it has none yet. A failed read rejects. */
export async function readResearchSubtaskResult(
  target: RuntimeClientTarget,
  sessionId: string
): Promise<string | null> {
  const result = await callRuntimeRpc<AgentSessionHistoryResult>(target, 'agentSession.history', {
    sessionId,
    direction: 'tail',
    limit: HISTORY_TAIL
  })
  return researchSubtaskResultFromItems(result.page.items)
}

/** The message the chat's agent gets: a short line the chat shows, the result folded beneath. */
export function researchSubtaskDeliveryMessage(task: string, result: string): string {
  return withAsterContext(`Subtask finished: ${task.trim()}`, {
    label: 'Subtask result',
    body: result
  })
}

/** The first lines of a result, for the card in the chat. */
export function researchSubtaskPreview(result: string): string {
  const text = result.replace(/\s+/g, ' ').trim()
  return text.length > 600 ? `${text.slice(0, 599)}…` : text
}
