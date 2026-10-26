import type { RawData } from 'ws'
import { delayUnlessAborted } from '../shared/abort-aware-delay'
import type { RuntimeClient } from './runtime-client'
import { runtimeSlackCoordinator, type SlackCoordinator } from './slack-agent-delivery'
import {
  openSlackSocket,
  slackApi,
  SlackApiError,
  type SlackApiCall,
  type SlackSocket
} from './slack-api'
import {
  SlackBridgeLease,
  SLACK_LEASE_REFRESH_MS,
  slackBridgeLeasePath,
  type SlackBridgeConnection
} from './slack-bridge-lease'
import { SlackBridgeSession } from './slack-bridge-session'
import type { SlackBridgeRoute } from './slack-events'

export type { SlackBridgeRoute } from './slack-events'

/** Revoked or wrong tokens will not heal by retrying quickly. */
const AUTH_ERRORS = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive'])
const AUTH_RETRY_MS = 5 * 60_000
const STANDBY_RETRY_MS = 10_000

export type SlackBridgeTransport = {
  api: SlackApiCall
  openSocket: (appToken: string) => Promise<SlackSocket>
}

function serveConnection(input: {
  socket: SlackSocket
  session: SlackBridgeSession
  routes: () => readonly SlackBridgeRoute[]
  lease: SlackBridgeLease
  signal: AbortSignal
  report: (connection: SlackBridgeConnection, notice?: string | null) => void
}): Promise<void> {
  const { socket, session, lease, signal } = input
  return new Promise<void>((resolve) => {
    let closed = false
    const finish = (): void => {
      if (closed) {
        return
      }
      closed = true
      clearInterval(heartbeat)
      signal.removeEventListener('abort', stop)
      socket.close()
      resolve()
    }
    const stop = (): void => finish()
    // Why: losing the lease means another bridge owns this token's socket; Slack would split events.
    const heartbeat = setInterval(() => {
      if (!lease.update()) {
        console.error('[slack-bridge] another bridge took over this Slack connection')
        finish()
        return
      }
      session.noteLiveCoverage()
    }, SLACK_LEASE_REFRESH_MS)
    signal.addEventListener('abort', stop, { once: true })
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
      const envelopeId = Reflect.get(envelope, 'envelope_id')
      if (typeof envelopeId === 'string') {
        try {
          socket.send(JSON.stringify({ envelope_id: envelopeId }))
        } catch {
          console.error('[slack-bridge] could not acknowledge event')
          return
        }
      }
      session.receive(envelope, input.routes())
    })
    socket.once('close', () => {
      input.report('disconnected')
      finish()
    })
    socket.once('error', () => {
      console.error('[slack-bridge] socket error; reconnecting')
      finish()
    })
    session.beginConnection()
    void session
      .catchUp(input.routes())
      .then((notice) => !closed && input.report('connected', notice))
      .catch((error: unknown) => console.error('[slack-bridge] catch-up failed', error))
  })
}

export async function runSlackBridge(args: {
  client: RuntimeClient
  clientForRoute?: (route: SlackBridgeRoute) => RuntimeClient
  routes: () => readonly SlackBridgeRoute[]
  appToken: string
  botToken: string
  signal?: AbortSignal
  onStatus?: (status: SlackBridgeConnection) => void
  /** `service` marks the per-user background service in the shared connection lease. */
  mode?: 'service' | 'process'
  slack?: SlackBridgeTransport
  coordinator?: SlackCoordinator
  now?: () => number
}): Promise<void> {
  const api = args.slack?.api ?? slackApi
  const openSocket = args.slack?.openSocket ?? openSlackSocket
  const signal = args.signal ?? new AbortController().signal
  const lease = new SlackBridgeLease(
    slackBridgeLeasePath(args.client.userDataPath, args.appToken),
    args.mode ?? 'process'
  )
  const report = (connection: SlackBridgeConnection, notice?: string | null): void => {
    args.onStatus?.(connection)
    lease.update(notice === undefined ? { connection } : { connection, notice })
  }
  let session: SlackBridgeSession | null = null
  let reconnectDelay = 1_000
  try {
    while (!signal.aborted) {
      const claim = lease.held ? { claimed: true } : lease.claim()
      if (!claim.claimed) {
        args.onStatus?.('standby')
        await delayUnlessAborted(STANDBY_RETRY_MS, signal)
        continue
      }
      try {
        report('connecting')
        session ??= await SlackBridgeSession.open({
          client: args.client,
          clientForRoute: args.clientForRoute ?? (() => args.client),
          botToken: args.botToken,
          api,
          coordinator: args.coordinator ?? runtimeSlackCoordinator,
          now: args.now ?? Date.now
        })
        const socket = await openSocket(args.appToken)
        if (signal.aborted) {
          socket.close()
          return
        }
        report('connected')
        reconnectDelay = 1_000
        await serveConnection({ socket, session, routes: args.routes, lease, signal, report })
      } catch (error) {
        console.error('[slack-bridge] connection failed; retrying')
        const auth = error instanceof SlackApiError && AUTH_ERRORS.has(error.code)
        report(
          'error',
          auth ? 'Slack rejected the tokens. Reconnect the Slack bot in Aster.' : null
        )
        if (auth) {
          reconnectDelay = AUTH_RETRY_MS
        }
      }
      if (signal.aborted) {
        return
      }
      await delayUnlessAborted(reconnectDelay, signal)
      reconnectDelay = Math.min(reconnectDelay * 2, Math.max(reconnectDelay, 30_000))
    }
  } finally {
    lease.release()
  }
}
