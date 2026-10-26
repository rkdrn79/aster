import type { AgentLaunchResult } from '../shared/agent-launch-intent'
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../shared/structured-agent-session-send-mutation'
import type { TuiAgent } from '../shared/tui-agent'
import { callAgentLaunch, getAgentLaunchCapabilities } from './agent-launch-request'
import { RuntimeClientError, type RuntimeClient } from './runtime-client'
import { history, waitForAnswer } from './slack-agent-history'
import { slackCoordinatorPrompt } from './slack-coordinator-prompt'
import { operationId } from './slack-bridge-state'
import type { SlackIncomingMessage } from './slack-events'

export type SlackDeliveryArgs = {
  client: RuntimeClient
  agent: TuiAgent
  worktree: string
  message: SlackIncomingMessage
  projectName: string
  sessionId?: string
}

export type SlackDelivery = { sessionId: string; previousTurnId: string | null; messageId: string }

/** How the bridge reaches a project's coordinator; tests substitute a fake. */
export type SlackCoordinator = {
  deliver: (args: SlackDeliveryArgs) => Promise<SlackDelivery>
  waitForAnswer: (client: RuntimeClient, delivery: SlackDelivery) => Promise<string>
}

const RUNTIME_WAIT_MS = 3 * 60_000

/**
 * Why wait: after the app quits, the background runtime takes up to a minute to take the profile
 * over, and catch-up at login races its start. Only the read-only status probe is retried.
 */
async function waitForRuntime(client: RuntimeClient): Promise<void> {
  const deadline = Date.now() + RUNTIME_WAIT_MS
  for (;;) {
    try {
      await client.call('status.get')
      return
    } catch (error) {
      const unavailable =
        error instanceof RuntimeClientError && error.code === 'runtime_unavailable'
      if (!unavailable || Date.now() >= deadline) {
        return
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
}

async function deliverToAgent(args: SlackDeliveryArgs): Promise<SlackDelivery> {
  const { client, message } = args
  const prompt = slackCoordinatorPrompt({ message, projectName: args.projectName })
  if (!args.sessionId) {
    const capabilities = await getAgentLaunchCapabilities(client)
    if (!capabilities) {
      throw new Error('This Aster host cannot launch agents from the bridge')
    }
    const response = await callAgentLaunch(
      client,
      {
        agent: args.agent,
        prompt: { text: prompt, delivery: 'submit' },
        surface: 'chat',
        operationId: operationId(message)
      },
      { target: { kind: 'existing', worktree: args.worktree }, presentation: 'background' },
      capabilities
    )
    const outcome: AgentLaunchResult['outcome'] = response.result.outcome
    if (outcome.kind !== 'structured') {
      throw new Error(
        `Aster opened a terminal (${outcome.handle}); Slack replies require a chat session`
      )
    }
    if (response.result.prompt?.outcome !== 'journaled') {
      throw new Error(
        `Aster could not confirm delivery of the Slack message to ${outcome.sessionId}`
      )
    }
    return {
      sessionId: outcome.sessionId,
      previousTurnId: null,
      messageId: response.result.prompt.messageId
    }
  }
  const before = await history(client, args.sessionId)
  const fence = before.page.fence
  if (!before.ok || fence === undefined) {
    throw new Error('Aster could not verify the conversation fence; no message was sent')
  }
  const mutation = structuredAgentSessionMessageSendMutation({
    sessionId: args.sessionId,
    clientOperationId: operationId(message),
    expectedRuntimeFence: fence,
    body: structuredAgentSessionSendBody(prompt, []),
    delivery: 'queue-if-active'
  })
  const response = await client.call<{
    ok: boolean
    value?: { clientMessageId: string }
    refusal?: { code: string }
  }>('agentSession.send', mutation)
  if (!response.result.ok) {
    throw new Error(
      `Aster refused the Slack message (${response.result.refusal?.code ?? 'unknown'})`
    )
  }
  return {
    sessionId: args.sessionId,
    previousTurnId: before.page.latestTurn?.itemId ?? null,
    messageId: response.result.value?.clientMessageId ?? operationId(message)
  }
}

export const runtimeSlackCoordinator: SlackCoordinator = {
  deliver: async (args) => {
    await waitForRuntime(args.client)
    return await deliverToAgent(args)
  },
  waitForAnswer: (client, delivery) =>
    waitForAnswer(client, delivery.sessionId, delivery.previousTurnId, delivery.messageId)
}
