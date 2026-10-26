import WebSocket from 'ws'

export type SlackHistoryMessage = {
  ts?: string
  user?: string
  text?: string
  thread_ts?: string
  subtype?: string
  bot_id?: string
  reply_count?: number
  latest_reply?: string
}

export type SlackApiResponse = {
  ok: boolean
  error?: string
  needed?: string
  url?: string
  ts?: string
  user_id?: string
  team_id?: string
  messages?: SlackHistoryMessage[]
  has_more?: boolean
  response_metadata?: { next_cursor?: string }
}

/** Carries Slack's error code (e.g. missing_scope) so callers can degrade instead of failing. */
export class SlackApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: string,
    readonly needed: string | null = null,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(`Slack ${method} failed: ${code}`)
  }
}

export type SlackApiCall = (
  method: string,
  token: string,
  body?: Record<string, unknown>,
  options?: { form?: boolean }
) => Promise<SlackApiResponse>

/** Read methods such as conversations.history only accept form-encoded arguments. */
export const slackApi: SlackApiCall = async (method, token, body, options) => {
  const form = options?.form === true
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type':
        body && !form ? 'application/json; charset=utf-8' : 'application/x-www-form-urlencoded'
    },
    body: !body
      ? ''
      : form
        ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
        : JSON.stringify(body)
  })
  if (response.status === 429) {
    const retryAfter = Number(response.headers?.get('retry-after'))
    throw new SlackApiError(
      method,
      'ratelimited',
      null,
      Number.isFinite(retryAfter) ? retryAfter : null
    )
  }
  if (!response.ok) {
    throw new Error(`Slack ${method} failed: HTTP ${response.status}`)
  }
  const result = (await response.json()) as SlackApiResponse
  if (!result.ok) {
    throw new SlackApiError(method, result.error ?? 'unknown_error', result.needed ?? null)
  }
  return result
}

export async function postSlackMessage(args: {
  token: string
  channel: string
  text: string
  threadTs?: string
  api?: SlackApiCall
}): Promise<void> {
  // Slack's message text limit is 40,000 characters; keep room for status prefixes.
  const text =
    args.text.length > 35_000 ? `${args.text.slice(0, 35_000)}\n… (truncated)` : args.text
  await (args.api ?? slackApi)('chat.postMessage', args.token, {
    channel: args.channel,
    text,
    ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
    parse: 'none',
    unfurl_links: false,
    unfurl_media: false
  })
}

export async function getSlackBotIdentity(
  token: string,
  api: SlackApiCall = slackApi
): Promise<{ userId: string; teamId: string }> {
  const identity = await api('auth.test', token)
  if (
    !identity.user_id ||
    !/^[UW][A-Z0-9]+$/.test(identity.user_id) ||
    !identity.team_id ||
    !/^T[A-Z0-9]+$/.test(identity.team_id)
  ) {
    throw new Error('Slack did not return a bot user and workspace identity')
  }
  return { userId: identity.user_id, teamId: identity.team_id }
}

/** The part of a Socket Mode connection the bridge uses; tests substitute a local fake. */
export type SlackSocket = {
  on(event: 'message', listener: (data: WebSocket.RawData) => void): unknown
  once(event: 'close' | 'error', listener: () => void): unknown
  send(data: string): void
  close(): void
}

/** Slack disconnects Socket Mode URLs periodically; each new connection gets a fresh URL. */
export async function openSlackSocket(appToken: string): Promise<SlackSocket> {
  const opened = await slackApi('apps.connections.open', appToken)
  if (!opened.url || !opened.url.startsWith('wss://')) {
    throw new Error('Slack did not provide a secure Socket Mode URL')
  }
  return await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(opened.url!, { handshakeTimeout: 15_000 })
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}
