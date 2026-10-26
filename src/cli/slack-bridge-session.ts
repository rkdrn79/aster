import type { RuntimeClient } from './runtime-client'
import type { SlackCoordinator } from './slack-agent-delivery'
import { getSlackBotIdentity, postSlackMessage, type SlackApiCall } from './slack-api'
import {
  compareSlackTs,
  readState,
  rememberProcessed,
  saveState,
  slackTsFromMs,
  statePath,
  threadKey,
  type BridgeState
} from './slack-bridge-state'
import { collectMissedMentions } from './slack-catch-up'
import {
  escapeSlackText,
  readSlackIncomingMessage,
  slackMessageKey,
  type SlackBridgeRoute,
  type SlackIncomingMessage
} from './slack-events'

export const OFFLINE_LABEL = 'Received while Aster was offline.'
/** Live delivery covers a connected period; the margin absorbs clock skew and delivery lag. */
const LIVE_COVERAGE_MARGIN_MS = 2 * 60_000

type SessionDeps = {
  client: RuntimeClient
  clientForRoute: (route: SlackBridgeRoute) => RuntimeClient
  botToken: string
  api: SlackApiCall
  coordinator: SlackCoordinator
  now: () => number
}

/** Per bot identity: dedup, per-thread lanes and sessions, and catch-up cursors. */
export class SlackBridgeSession {
  private readonly seen: Set<string>
  private readonly inFlight = new Set<string>()
  private readonly lanes = new Map<string, Promise<void>>()
  private readonly caughtUp = new Set<string>()

  private constructor(
    private readonly deps: SessionDeps,
    readonly identity: { userId: string; teamId: string },
    private readonly path: string,
    private readonly state: BridgeState
  ) {
    this.seen = new Set(state.processed)
    state.cursors ??= {}
  }

  static async open(deps: SessionDeps): Promise<SlackBridgeSession> {
    const identity = await getSlackBotIdentity(deps.botToken, deps.api)
    const path = statePath(deps.client.userDataPath, identity.teamId, identity.userId)
    return new SlackBridgeSession(deps, identity, path, readState(path))
  }

  /** Routes one Socket Mode envelope; exactly one project route must claim it. */
  receive(envelope: unknown, routes: readonly SlackBridgeRoute[]): void {
    const matches = routes.flatMap((route) => {
      const message = readSlackIncomingMessage(envelope, {
        allowedUsers: route.allowedUsers,
        allowedChannels: route.allowedChannels,
        botUserId: this.identity.userId,
        botTeamId: this.identity.teamId
      })
      return message ? [{ message, route }] : []
    })
    if (matches.length !== 1) {
      if (matches.length > 1) {
        console.error('[slack-bridge] multiple project routes match one Slack event')
      }
      return
    }
    this.enqueue(matches[0].message, matches[0].route)
  }

  enqueue(message: SlackIncomingMessage, route: SlackBridgeRoute): void {
    const key = slackMessageKey(message)
    // Why eventId too: bridges before catch-up recorded Slack event IDs, not message keys.
    if (this.seen.has(key) || this.seen.has(message.eventId) || this.inFlight.has(key)) {
      return
    }
    this.inFlight.add(key)
    const lane = threadKey(message, route.id)
    const next = (this.lanes.get(lane) ?? Promise.resolve())
      .then(() => this.process(message, route))
      .catch((error: unknown) => console.error('[slack-bridge] event failed', error))
    this.lanes.set(lane, next)
    void next.finally(() => {
      if (this.lanes.get(lane) === next) {
        this.lanes.delete(lane)
      }
    })
  }

  private async post(message: SlackIncomingMessage, text: string): Promise<void> {
    await postSlackMessage({
      token: this.deps.botToken,
      channel: message.channel,
      threadTs: message.threadTs,
      text,
      api: this.deps.api
    })
  }

  private async process(message: SlackIncomingMessage, route: SlackBridgeRoute): Promise<void> {
    const key = threadKey(message, route.id)
    try {
      const targetClient = this.deps.clientForRoute(route)
      const delivery = await this.deps.coordinator.deliver({
        client: targetClient,
        agent: route.agent,
        worktree: route.worktree,
        projectName: route.projectName,
        message,
        sessionId: this.state.threads[key]
      })
      this.state.threads[key] = delivery.sessionId
      this.save()
      await this.post(
        message,
        `${message.late ? OFFLINE_LABEL : 'Aster received your message.'} I will reply here when this background coordinator finishes.`
      ).catch((error: unknown) => console.error('[slack-bridge] status reply failed', error))
      const answer = await this.deps.coordinator.waitForAnswer(targetClient, delivery)
      await this.post(
        message,
        `${message.late ? `${OFFLINE_LABEL}\n\n` : ''}${escapeSlackText(answer)}`
      )
    } catch (error) {
      console.error(
        '[slack-bridge]',
        error instanceof Error ? error.message : 'Unknown bridge error'
      )
      await this.post(
        message,
        'Aster could not complete this request. Check the Aster host for details.'
      ).catch((postError: unknown) =>
        console.error('[slack-bridge] failed to post error', postError)
      )
    } finally {
      this.inFlight.delete(slackMessageKey(message))
      this.state.processed = rememberProcessed(this.seen, slackMessageKey(message))
      this.save()
    }
  }

  /** Call when a socket opens: channels count as covered only after this connection's catch-up. */
  beginConnection(): void {
    this.caughtUp.clear()
  }

  /** Queues mentions missed while offline; returns a status line for the dialog, or null. */
  async catchUp(routes: readonly SlackBridgeRoute[]): Promise<string | null> {
    const result = await collectMissedMentions({
      api: this.deps.api,
      botToken: this.deps.botToken,
      identity: this.identity,
      routes,
      cursors: this.state.cursors ?? {},
      threads: this.state.threads,
      isProcessed: (key) => this.seen.has(key) || this.inFlight.has(key),
      now: this.deps.now()
    })
    for (const [channel, ts] of Object.entries(result.cursors)) {
      this.advance(channel, ts)
      this.caughtUp.add(channel)
    }
    this.save()
    for (const { message, route } of result.found) {
      this.enqueue(message, route)
    }
    const found =
      result.found.length > 0
        ? [`Answering ${result.found.length} Slack mention(s) sent while Aster was offline.`]
        : []
    return [...found, ...result.notices].join(' ') || null
  }

  /** While connected, live delivery covered every caught-up channel up to now. */
  noteLiveCoverage(): void {
    const ts = slackTsFromMs(this.deps.now() - LIVE_COVERAGE_MARGIN_MS)
    if ([...this.caughtUp].map((channel) => this.advance(channel, ts)).some(Boolean)) {
      this.save()
    }
  }

  private advance(channel: string, ts: string): boolean {
    const cursors = (this.state.cursors ??= {})
    const current = cursors[channel]
    if (current && compareSlackTs(ts, current) <= 0) {
      return false
    }
    cursors[channel] = ts
    return true
  }

  private save(): void {
    saveState(this.path, this.state)
  }
}
