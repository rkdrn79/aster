import type { AgentSessionHistoryResult } from '../shared/agent-session-wire'
import { RuntimeClientError, type RuntimeClient } from './runtime-client'
import { completedSlackReply } from './slack-events'

export async function history(
  client: RuntimeClient,
  sessionId: string
): Promise<AgentSessionHistoryResult> {
  const response = await client.call<AgentSessionHistoryResult>('agentSession.history', {
    sessionId,
    direction: 'tail',
    limit: 200
  })
  return response.result
}

export async function waitForAnswer(
  client: RuntimeClient,
  sessionId: string,
  previousTurnId: string | null,
  messageId: string
): Promise<string> {
  const deadline = Date.now() + 2 * 60 * 60 * 1000
  let providerItemId: string | null = null
  while (Date.now() < deadline) {
    let result: AgentSessionHistoryResult
    try {
      result = await history(client, sessionId)
    } catch (error) {
      if (
        error instanceof RuntimeClientError &&
        (error.code === 'runtime_unavailable' || error.code === 'runtime_timeout')
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5_000))
        continue
      }
      throw error
    }
    providerItemId =
      result.page.submissions.find((item) => item.clientMessageId === messageId)?.providerItemId ??
      providerItemId
    const reply = completedSlackReply(result.page, previousTurnId, messageId, providerItemId)
    if (reply) {
      if (reply.outcome !== 'success') {
        return `Aster agent turn ended (${reply.outcome}). ${reply.text || 'Open the conversation in Aster for details.'}`
      }
      return (
        reply.text || 'The agent finished without a text reply. Open the conversation in Aster.'
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  return 'The agent has not returned a confirmed answer yet. Open the conversation in Aster to check its status.'
}
