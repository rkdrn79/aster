import type { RawData } from 'ws'
import type { AgentLaunchResult } from '../shared/agent-launch-intent'
import { delayUnlessAborted } from '../shared/abort-aware-delay'
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../shared/structured-agent-session-send-mutation'
import type { TuiAgent } from '../shared/tui-agent'
import { callAgentLaunch, getAgentLaunchCapabilities } from './agent-launch-request'
import type { RuntimeClient } from './runtime-client'
import { history, waitForAnswer } from './slack-agent-history'
import { getSlackBotIdentity, openSlackSocket, postSlackMessage } from './slack-api'
import { slackCoordinatorPrompt } from './slack-coordinator-prompt'
import { operationId, readState, saveState, statePath, threadKey } from './slack-bridge-state'
import {
  escapeSlackText,
  readSlackIncomingMessage,
  type SlackIncomingMessage
} from './slack-events'

async function deliverToAgent(args: {
  client: RuntimeClient
  agent: TuiAgent
  worktree: string
  message: SlackIncomingMessage
  projectName: string
  sessionId?: string
}): Promise<{ sessionId: string; previousTurnId: string | null; messageId: string }> {
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

export type SlackBridgeRoute = {
  id: string
  projectName: string
  agent: TuiAgent
  worktree: string
  allowedUsers: ReadonlySet<string>
  allowedChannels?: ReadonlySet<string>
}

export async function runSlackBridge(args: {
  client: RuntimeClient
  routes: () => readonly SlackBridgeRoute[]
  appToken: string
  botToken: string
  signal?: AbortSignal
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
}): Promise<void> {
  const identity = await getSlackBotIdentity(args.botToken)
  const path = statePath(args.client.userDataPath, identity.teamId, identity.userId)
  const state = readState(path)
  const seen = new Set(state.processed)
  const inFlight = new Set<string>()
  const lanes = new Map<string, Promise<void>>()
  const processMessage = async (
    message: SlackIncomingMessage,
    route: SlackBridgeRoute
  ): Promise<void> => {
    const key = threadKey(message, route.id)
    try {
      const { sessionId, previousTurnId, messageId } = await deliverToAgent({
        client: args.client,
        agent: route.agent,
        worktree: route.worktree,
        projectName: route.projectName,
        message,
        sessionId: state.threads[key]
      })
      state.threads[key] = sessionId
      saveState(path, state)
      await postSlackMessage({
        token: args.botToken,
        channel: message.channel,
        threadTs: message.threadTs,
        text: 'Aster received your message. I will reply here when this background coordinator finishes.'
      }).catch((error: unknown) => console.error('[slack-bridge] status reply failed', error))
      const answer = await waitForAnswer(args.client, sessionId, previousTurnId, messageId)
      await postSlackMessage({
        token: args.botToken,
        channel: message.channel,
        threadTs: message.threadTs,
        text: escapeSlackText(answer)
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown bridge error'
      console.error('[slack-bridge]', reason)
      await postSlackMessage({
        token: args.botToken,
        channel: message.channel,
        threadTs: message.threadTs,
        text: 'Aster could not complete this request. Check the Aster host for details.'
      }).catch((postError: unknown) =>
        console.error('[slack-bridge] failed to post error', postError)
      )
    } finally {
      inFlight.delete(message.eventId)
      seen.add(message.eventId)
      while (seen.size > 1_000) {
        const oldest = seen.values().next().value
        if (oldest) {
          seen.delete(oldest)
        }
      }
      state.processed = [...seen].slice(-1_000)
      saveState(path, state)
    }
  }
  let reconnectDelay = 1_000
  while (!args.signal?.aborted) {
    try {
      args.onStatus?.('connecting')
      const socket = await openSlackSocket(args.appToken)
      if (args.signal?.aborted) {
        socket.close()
        return
      }
      args.onStatus?.('connected')
      reconnectDelay = 1_000
      await new Promise<void>((resolve) => {
        const stop = (): void => {
          socket.close()
          resolve()
        }
        args.signal?.addEventListener('abort', stop, { once: true })
        socket.on('message', (data: RawData) => {
          let envelope: unknown
          try {
            envelope = JSON.parse(data.toString())
          } catch {
            return
          }
          if (!envelope || typeof envelope !== 'object') {
            return
          }
          const raw = envelope as Record<string, unknown>
          if (typeof raw.envelope_id === 'string') {
            try {
              socket.send(JSON.stringify({ envelope_id: raw.envelope_id }))
            } catch {
              console.error('[slack-bridge] could not acknowledge event')
              return
            }
          }
          const matches = args.routes().flatMap((route) => {
            const message = readSlackIncomingMessage(envelope, {
              allowedUsers: route.allowedUsers,
              allowedChannels: route.allowedChannels,
              botUserId: identity.userId,
              botTeamId: identity.teamId
            })
            return message ? [{ message, route }] : []
          })
          if (matches.length !== 1) {
            if (matches.length > 1) {
              console.error('[slack-bridge] multiple project routes match one Slack event')
            }
            return
          }
          const [{ message, route }] = matches
          if (seen.has(message.eventId) || inFlight.has(message.eventId)) {
            return
          }
          inFlight.add(message.eventId)
          const key = threadKey(message, route.id)
          const lane = (lanes.get(key) ?? Promise.resolve())
            .then(() => processMessage(message, route))
            .catch((error: unknown) => console.error('[slack-bridge] event failed', error))
          lanes.set(key, lane)
          void lane.finally(() => {
            if (lanes.get(key) === lane) {
              lanes.delete(key)
            }
          })
        })
        socket.once('close', () => {
          args.signal?.removeEventListener('abort', stop)
          args.onStatus?.('disconnected')
          resolve()
        })
        socket.once('error', () => {
          console.error('[slack-bridge] socket error; reconnecting')
          socket.close()
          resolve()
        })
      })
    } catch {
      console.error('[slack-bridge] connection failed; retrying')
      args.onStatus?.('error')
    }
    if (args.signal?.aborted) {
      return
    }
    await delayUnlessAborted(reconnectDelay, args.signal ?? new AbortController().signal)
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
  }
}
