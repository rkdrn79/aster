import WebSocket from 'ws'

type SlackApiResponse = {
  ok: boolean
  error?: string
  url?: string
  ts?: string
  user_id?: string
  team_id?: string
}

export async function slackApi(
  method: string,
  token: string,
  body?: Record<string, unknown>
): Promise<SlackApiResponse> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': body ? 'application/json; charset=utf-8' : 'application/x-www-form-urlencoded'
    },
    body: body ? JSON.stringify(body) : ''
  })
  if (!response.ok) {
    throw new Error(`Slack ${method} failed: HTTP ${response.status}`)
  }
  const result = (await response.json()) as SlackApiResponse
  if (!result.ok) {
    throw new Error(`Slack ${method} failed: ${result.error ?? 'unknown error'}`)
  }
  return result
}

export async function postSlackMessage(args: {
  token: string
  channel: string
  text: string
  threadTs?: string
}): Promise<void> {
  // Slack's message text limit is 40,000 characters; keep room for status prefixes.
  const text =
    args.text.length > 35_000 ? `${args.text.slice(0, 35_000)}\n… (truncated)` : args.text
  await slackApi('chat.postMessage', args.token, {
    channel: args.channel,
    text,
    ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
    parse: 'none',
    unfurl_links: false,
    unfurl_media: false
  })
}

export async function getSlackBotIdentity(
  token: string
): Promise<{ userId: string; teamId: string }> {
  const identity = await slackApi('auth.test', token)
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

/** Slack disconnects Socket Mode URLs periodically; each new connection gets a fresh URL. */
export async function openSlackSocket(appToken: string): Promise<WebSocket> {
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
