import { SlackApiError, type SlackApiCall, type SlackHistoryMessage } from './slack-api'
import { compareSlackTs, knownThreads, slackTsFromMs } from './slack-bridge-state'
import {
  readSlackIncomingMessage,
  slackMessageKey,
  type SlackBridgeRoute,
  type SlackIncomingMessage
} from './slack-events'

export const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000
export const CATCH_UP_MESSAGE_CAP = 200
const KNOWN_THREAD_CAP = 5
const THREAD_CAP = 20

export type CatchUpFound = { message: SlackIncomingMessage; route: SlackBridgeRoute }

type ChannelWindow = { messages: SlackHistoryMessage[]; newestTs: string | null; capped: boolean }

/**
 * Only real, authorized bot mentions newer than `oldest` that no earlier pass handled. The same
 * event filter as live delivery decides, so catch-up can never admit a message live would refuse.
 */
export function selectMissedMentions(
  messages: readonly SlackHistoryMessage[],
  input: {
    channel: string
    oldest: string
    route: SlackBridgeRoute
    identity: { userId: string; teamId: string }
    isProcessed: (key: string) => boolean
  }
): SlackIncomingMessage[] {
  const found = new Map<string, SlackIncomingMessage>()
  for (const item of messages) {
    if (typeof item.ts !== 'string' || compareSlackTs(item.ts, input.oldest) <= 0) {
      continue
    }
    const key = slackMessageKey({ channel: input.channel, eventTs: item.ts })
    if (found.has(key) || input.isProcessed(key)) {
      continue
    }
    const message = readSlackIncomingMessage(
      {
        type: 'events_api',
        payload: {
          type: 'event_callback',
          team_id: input.identity.teamId,
          event_id: `catch-up:${key}`,
          event: { ...item, type: 'app_mention', channel: input.channel }
        }
      },
      {
        allowedUsers: input.route.allowedUsers,
        allowedChannels: input.route.allowedChannels,
        botUserId: input.identity.userId,
        botTeamId: input.identity.teamId
      }
    )
    if (message) {
      found.set(key, { ...message, late: true })
    }
  }
  return [...found.values()].sort((left, right) => compareSlackTs(left.eventTs, right.eventTs))
}

async function call(
  api: SlackApiCall,
  method: string,
  token: string,
  params: Record<string, string>
): ReturnType<SlackApiCall> {
  try {
    return await api(method, token, params, { form: true })
  } catch (error) {
    // Why one bounded retry: catch-up is best effort and the next reconnect tries again.
    const wait = error instanceof SlackApiError ? error.retryAfterSeconds : null
    if (wait === null || wait > 30) {
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    return await api(method, token, params, { form: true })
  }
}

async function readChannelWindow(input: {
  api: SlackApiCall
  token: string
  channel: string
  oldest: string
  threads: readonly string[]
}): Promise<ChannelWindow> {
  const { api, token, channel, oldest } = input
  const history: SlackHistoryMessage[] = []
  let cursor: string | undefined
  let capped = false
  while (history.length < CATCH_UP_MESSAGE_CAP) {
    const page = await call(api, 'conversations.history', token, {
      channel,
      oldest,
      limit: String(CATCH_UP_MESSAGE_CAP - history.length),
      ...(cursor ? { cursor } : {})
    })
    history.push(...(page.messages ?? []))
    cursor = page.response_metadata?.next_cursor || undefined
    capped = page.has_more === true
    if (!capped || !cursor) {
      break
    }
  }
  const active = history
    .filter((item) => (item.reply_count ?? 0) > 0 && typeof item.ts === 'string')
    .filter((item) => compareSlackTs(item.latest_reply ?? item.ts ?? '0', oldest) > 0)
    .map((item) => item.ts ?? '')
  const threads = [...new Set([...active, ...input.threads.slice(0, KNOWN_THREAD_CAP)])].slice(
    0,
    THREAD_CAP
  )
  const replies: SlackHistoryMessage[] = []
  for (const ts of threads) {
    const remaining = CATCH_UP_MESSAGE_CAP - replies.length
    if (remaining <= 0) {
      capped = true
      break
    }
    const page = await call(api, 'conversations.replies', token, {
      channel,
      ts,
      oldest,
      limit: String(remaining)
    })
    replies.push(...(page.messages ?? []).filter((item) => item.ts !== ts))
  }
  const newestTs = history
    .map((item) => item.ts)
    .filter((ts): ts is string => typeof ts === 'string')
    .reduce<string | null>((max, ts) => (!max || compareSlackTs(ts, max) > 0 ? ts : max), null)
  return { messages: [...history, ...replies], newestTs, capped }
}

function skippedNotice(channel: string, error: unknown): string {
  if (error instanceof SlackApiError && error.code === 'missing_scope') {
    const scope = error.needed ?? 'channels:history or groups:history'
    return `Catch-up skipped in ${channel}: the Slack app lacks ${scope}. Add the scope and reinstall the app.`
  }
  if (error instanceof SlackApiError && error.code === 'not_in_channel') {
    return `Catch-up skipped in ${channel}: invite the bot to the channel.`
  }
  if (error instanceof SlackApiError && error.code === 'ratelimited') {
    return `Catch-up in ${channel} was rate-limited by Slack; it retries on the next reconnect.`
  }
  const reason = error instanceof Error ? error.message : 'unknown error'
  return `Catch-up skipped in ${channel}: ${reason}.`
}

/**
 * Reads each allowed channel since its cursor (at most 24 h and 200 messages plus 200 thread
 * replies) and returns mentions nobody handled. A channel seen for the first time only gets a
 * cursor, so binding a channel never answers old messages. A failed channel keeps its cursor.
 */
export async function collectMissedMentions(input: {
  api: SlackApiCall
  botToken: string
  identity: { userId: string; teamId: string }
  routes: readonly SlackBridgeRoute[]
  cursors: Readonly<Record<string, string>>
  threads: Readonly<Record<string, string>>
  isProcessed: (key: string) => boolean
  now: number
}): Promise<{ found: CatchUpFound[]; cursors: Record<string, string>; notices: string[] }> {
  const found: CatchUpFound[] = []
  const cursors: Record<string, string> = {}
  const notices: string[] = []
  const floor = slackTsFromMs(input.now - CATCH_UP_WINDOW_MS)
  for (const route of input.routes) {
    for (const channel of route.allowedChannels ?? []) {
      const cursor = input.cursors[channel]
      if (!cursor) {
        cursors[channel] = slackTsFromMs(input.now)
        continue
      }
      const oldest = compareSlackTs(cursor, floor) > 0 ? cursor : floor
      try {
        const window = await readChannelWindow({
          api: input.api,
          token: input.botToken,
          channel,
          oldest,
          threads: knownThreads(input.threads, route.id, channel)
        })
        const messages = selectMissedMentions(window.messages, {
          channel,
          oldest,
          route,
          identity: input.identity,
          isProcessed: input.isProcessed
        })
        found.push(...messages.map((message) => ({ message, route })))
        cursors[channel] = window.newestTs ?? oldest
        if (window.capped) {
          notices.push(
            `Catch-up in ${channel} read only the newest ${CATCH_UP_MESSAGE_CAP} messages.`
          )
        }
      } catch (error) {
        notices.push(skippedNotice(channel, error))
      }
    }
  }
  return { found, cursors, notices }
}
