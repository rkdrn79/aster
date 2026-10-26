import type { AgentSessionHistoryPage, AgentSessionLatestTurn } from '../shared/agent-session-wire'
import { agentJournalSubmissionKey } from '../shared/agent-session-journal-item-key'
import type { TuiAgent } from '../shared/tui-agent'

export type SlackIncomingMessage = {
  eventId: string
  teamId: string
  channel: string
  threadTs: string
  eventTs: string
  user: string
  text: string
  /** Found by catch-up after the bridge was offline, so the reply is marked as late. */
  late?: boolean
}

export type SlackBridgeRoute = {
  id: string
  projectName: string
  agent: TuiAgent
  worktree: string
  /** Only set for a route whose project is hosted on a paired remote runtime. */
  environmentId?: string
  hostKeyFingerprint?: string
  runtimeId?: string
  allowedUsers: ReadonlySet<string>
  allowedChannels?: ReadonlySet<string>
}

/** One Slack message, whether it arrived live or through catch-up. */
export function slackMessageKey(
  message: Pick<SlackIncomingMessage, 'channel' | 'eventTs'>
): string {
  return `${message.channel}:${message.eventTs}`
}

/** Agent output is data, so it must not turn into a Slack mention or link instruction. */
export function escapeSlackText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function readSlackIncomingMessage(
  envelope: unknown,
  access: {
    allowedUsers: ReadonlySet<string>
    allowedChannels?: ReadonlySet<string>
    botUserId?: string
    botTeamId?: string
  }
): SlackIncomingMessage | null {
  if (!envelope || typeof envelope !== 'object') {
    return null
  }
  const outer = envelope as Record<string, unknown>
  if (outer.type !== 'events_api' || !outer.payload || typeof outer.payload !== 'object') {
    return null
  }
  const payload = outer.payload as Record<string, unknown>
  if (payload.type !== 'event_callback' || !payload.event || typeof payload.event !== 'object') {
    return null
  }
  const event = payload.event as Record<string, unknown>
  const isDm = !access.allowedChannels && event.type === 'message' && event.channel_type === 'im'
  const isMention = access.allowedChannels && event.type === 'app_mention'
  if (
    (!isDm && !isMention) ||
    event.subtype !== undefined ||
    event.bot_id !== undefined ||
    typeof event.user !== 'string' ||
    (!access.allowedUsers.has('*') && !access.allowedUsers.has(event.user)) ||
    typeof event.channel !== 'string' ||
    (isDm && !/^D[A-Z0-9]+$/.test(event.channel)) ||
    (isMention &&
      (!/^[CG][A-Z0-9]+$/.test(event.channel) ||
        !access.allowedChannels?.has(event.channel) ||
        !access.botUserId)) ||
    typeof event.ts !== 'string' ||
    !/^\d+\.\d+$/.test(event.ts) ||
    typeof event.text !== 'string' ||
    !event.text.trim() ||
    event.text.length > 32_000 ||
    typeof payload.event_id !== 'string' ||
    typeof payload.team_id !== 'string' ||
    (access.botTeamId && payload.team_id !== access.botTeamId)
  ) {
    return null
  }
  const text = isMention
    ? event.text
        .replace(new RegExp(`[ \\t]*<@${access.botUserId}(?:\\|[^>]*)?>[ \\t]*`, 'g'), ' ')
        .trim()
    : event.text.trim()
  if (!text || (isMention && text === event.text.trim())) {
    return null
  }
  const threadTs = typeof event.thread_ts === 'string' ? event.thread_ts : event.ts
  if (!/^\d+\.\d+$/.test(threadTs)) {
    return null
  }
  return {
    eventId: payload.event_id,
    teamId: payload.team_id,
    channel: event.channel,
    threadTs,
    eventTs: event.ts,
    user: event.user,
    text
  }
}

/** Only the main agent's text from the newly completed turn, never tools or child-agent rows. */
export function completedSlackReply(
  page: AgentSessionHistoryPage,
  previousTurnId: string | null,
  expectedMessageId?: string,
  expectedProviderItemId?: string | null
): { turnId: string; outcome: string; text: string } | null {
  const candidates: AgentSessionLatestTurn[] = [
    ...(page.latestTurn ? [page.latestTurn] : []),
    ...page.items.flatMap((item) =>
      item.body.kind === 'turn'
        ? [{ itemId: item.itemId, observedAt: item.observedAt, turn: item.body }]
        : []
    )
  ]
  const submission = page.submissions.find((item) => item.clientMessageId === expectedMessageId)
  const latest = candidates.find((candidate) => {
    if (candidate.itemId === previousTurnId || candidate.turn.state === 'running') {
      return false
    }
    if (!expectedMessageId) {
      return candidate === page.latestTurn
    }
    const providerItemId = submission?.providerItemId ?? expectedProviderItemId
    return (
      candidate.turn.userItemId === agentJournalSubmissionKey(expectedMessageId) ||
      (providerItemId != null && candidate.turn.userItemId === providerItemId)
    )
  })
  if (!latest) {
    return null
  }
  const messages = page.items.filter(
    (item) =>
      item.turnScope?.kind === 'turn' &&
      item.turnScope.turnItemId === latest.itemId &&
      item.body.kind === 'message' &&
      item.body.role === 'assistant' &&
      item.agentId === undefined &&
      item.producerKind !== 'background'
  )
  const lastMessage = messages.at(-1)
  const text = (lastMessage?.body.kind === 'message' ? lastMessage.body.blocks : [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
    .trim()
  return {
    turnId: latest.itemId,
    outcome: latest.turn.outcome ?? 'unconfirmed',
    text: lastMessage?.shortened
      ? `${text}\n\n[Reply shortened; open Aster for the full text.]`
      : text
  }
}
