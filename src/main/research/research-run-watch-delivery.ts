import { randomUUID } from 'node:crypto'
import { formatResearchRunName } from '../../shared/research/research-run-reference'
import type {
  ResearchRunWatch,
  ResearchWatchEvent,
  ResearchWatchOwner
} from '../../shared/research/research-run-watch'
import { describeResearchWatchRunState } from '../../shared/research/research-run-watch-evaluation'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import type { RuntimeTerminalAgentStatusState } from '../../shared/runtime-terminal-contracts'
import { sendAgentTurn } from '../runtime/orchestration/send-agent-turn'
import type { RuntimeAgentPromptWriteOptions } from '../runtime/runtime-terminal-contracts'
import { researchRunStatusCommand } from './research-run-watch-advance'

/** What a watch uses of the Orca runtime: agent status, settlement, the prompt writer, alerts. */
export type ResearchWatchRuntime = {
  getTerminalAgentStatus(
    handle: string
  ): Promise<{ isRunningAgent: boolean; status: RuntimeTerminalAgentStatusState }>
  waitForTerminal(
    handle: string,
    options: { condition: 'tui-idle'; timeoutMs: number }
  ): Promise<{ satisfied: boolean }>
  sendTerminalAgentPrompt(
    handle: string,
    prompt: string,
    options: RuntimeAgentPromptWriteOptions
  ): Promise<unknown>
  resolveTerminalPane(paneKey: string): { handle: string }
  dispatchPluginNotification(input: {
    pluginId: string
    title: string
    body?: string
  }): Promise<{ delivered: boolean }>
}

export type ResearchWatchDeliveryResult =
  | { state: 'delivered'; detail: string }
  /** Nothing was typed; the next pass tries again. */
  | { state: 'retry'; detail: string }

const SETTLE_WAIT_MS = 2_000
const DELIVERY_EXPIRY_MS = 24 * 60 * 60_000
const STRUCTURED_SEND_BUDGET_MS = 5_000

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function liveTerminalHandle(
  runtime: ResearchWatchRuntime,
  owner: ResearchWatchOwner
): Promise<string | null> {
  if (owner.terminalHandle) {
    try {
      await runtime.getTerminalAgentStatus(owner.terminalHandle)
      return owner.terminalHandle
    } catch {
      // A reminted pane keeps its pane key; resolve through it below.
    }
  }
  if (!owner.paneKey) {
    return null
  }
  try {
    return runtime.resolveTerminalPane(owner.paneKey).handle
  } catch {
    return null
  }
}

async function agentReadyForInput(
  runtime: ResearchWatchRuntime,
  handle: string
): Promise<string | null> {
  const status = await runtime.getTerminalAgentStatus(handle)
  if (!status.isRunningAgent) {
    return 'no agent is running in the owner terminal'
  }
  if (status.status === 'working' || status.status === 'permission') {
    return `the owner agent is ${status.status === 'working' ? 'mid-turn' : 'waiting on a permission prompt'}`
  }
  return null
}

/**
 * Types the message into the owner's agent only when its turn is over and its composer is
 * settled: the same tui-idle reading orchestration uses before it types a mailbox pointer, and
 * the runtime's one agent-prompt writer (bracketed paste, per-PTY serialization).
 */
async function deliverToTerminal(
  runtime: ResearchWatchRuntime,
  owner: ResearchWatchOwner,
  text: string
): Promise<ResearchWatchDeliveryResult> {
  const handle = await liveTerminalHandle(runtime, owner)
  if (!handle) {
    return { state: 'retry', detail: 'the owner terminal is not open' }
  }
  const notReady = await agentReadyForInput(runtime, handle).catch(errorText)
  if (notReady) {
    return { state: 'retry', detail: notReady }
  }
  const settled = await runtime
    .waitForTerminal(handle, { condition: 'tui-idle', timeoutMs: SETTLE_WAIT_MS })
    .catch(() => null)
  if (!settled?.satisfied) {
    return { state: 'retry', detail: 'the owner agent has not settled at its prompt' }
  }
  try {
    await runtime.sendTerminalAgentPrompt(handle, text, {
      inputKind: 'driving',
      acceptQueued: true,
      requestId: randomUUID(),
      observationTimeoutMs: 0,
      // Re-read right before the bytes go out: a turn that started meanwhile refuses the write.
      beforeWrite: async () => {
        const reason = await agentReadyForInput(runtime, handle)
        if (reason) {
          throw new Error(reason)
        }
      }
    })
    return { state: 'delivered', detail: `typed into ${handle}` }
  } catch (error) {
    return { state: 'retry', detail: errorText(error).slice(0, 300) }
  }
}

/** A structured chat takes it through its own send, queued behind a running turn like a person's. */
async function deliverToSession(
  sessionId: string,
  operationId: string,
  text: string
): Promise<ResearchWatchDeliveryResult> {
  const host = getStructuredAgentSessionHost()
  const fence = host?.deps.store.getRecord(sessionId)?.lease.runtimeFence
  if (!host || fence === undefined || fence === null) {
    return { state: 'retry', detail: 'the owner chat is not attached' }
  }
  try {
    const outcome = await sendAgentTurn({
      kind: 'structured-session',
      host,
      sessionId,
      callerKey: `trusted-local:research-watch:${sessionId}`,
      budgetMs: STRUCTURED_SEND_BUDGET_MS,
      turn: {
        body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text }] },
        // Stable per event: a retry replays the recorded answer instead of sending twice.
        operationId,
        expectedRuntimeFence: fence,
        delivery: 'queue'
      }
    })
    return outcome.kind === 'refused'
      ? { state: 'retry', detail: `the chat refused it (${outcome.refusal.code})` }
      : { state: 'delivered', detail: outcome.kind === 'queued' ? 'queued in the chat' : 'sent' }
  } catch (error) {
    return { state: 'retry', detail: errorText(error).slice(0, 300) }
  }
}

export function deliverResearchWatchMessage(
  runtime: ResearchWatchRuntime,
  owner: ResearchWatchOwner,
  operationId: string,
  text: string
): Promise<ResearchWatchDeliveryResult> {
  return owner.agentSessionId
    ? deliverToSession(owner.agentSessionId, operationId, text)
    : deliverToTerminal(runtime, owner, text)
}

/** Desktop banner plus paired phones, through the runtime's generic notification lane. */
export async function notifyResearchWatchEvent(
  runtime: ResearchWatchRuntime,
  title: string,
  body: string
): Promise<void> {
  await runtime
    .dispatchPluginNotification({ pluginId: 'Research', title, body })
    .catch((error: unknown) => console.warn('[research-watch] notification failed', error))
}

export function formatResearchWatchDelivery(
  watch: ResearchRunWatch,
  events: readonly ResearchWatchEvent[]
): string {
  const latest = events.at(-1)
  const where = watch.run.hostLabel ? ` on ${watch.run.hostLabel}` : ''
  const lines = [
    `[Aster research watch ${watch.id}] Run ${formatResearchRunName(watch.run)}${where}:`,
    ...events.map((event) =>
      event.implicit
        ? `- the Run ended, so this watch closed: ${event.evidence}`
        : `- ${event.condition} fired: ${event.evidence}`
    ),
    `Now: ${describeResearchWatchRunState(latest?.runState ?? null, latest?.lastMetrics ?? null)}`
  ]
  if (watch.message) {
    lines.push(`Your note: ${watch.message}`)
  }
  lines.push(`Details: ${researchRunStatusCommand(watch)}`)
  return lines.join('\n')
}

export async function deliverResearchWatchEvents(
  runtime: ResearchWatchRuntime | null,
  watch: ResearchRunWatch,
  now: Date
): Promise<ResearchRunWatch> {
  const at = now.toISOString()
  let fired = watch.fired
  if (runtime) {
    fired = await Promise.all(
      fired.map(async (event) => {
        if (event.notifiedAt) {
          return event
        }
        await notifyResearchWatchEvent(
          runtime,
          `Run ${formatResearchRunName(watch.run)}: ${event.implicit ? 'ended' : event.condition}`,
          event.evidence
        )
        return { ...event, notifiedAt: at }
      })
    )
  }
  const pending = fired.flatMap((event, index) =>
    event.delivery.state === 'pending' ? [index] : []
  )
  if (!pending.length || !watch.owner) {
    return { ...watch, fired }
  }
  const expired = pending.filter(
    (index) => Date.parse(fired[index].firedAt) + DELIVERY_EXPIRY_MS < now.getTime()
  )
  const live = pending.filter((index) => !expired.includes(index))
  const outcome =
    live.length && runtime
      ? await deliverResearchWatchMessage(
          runtime,
          watch.owner,
          `research-watch:${watch.id}:${live.join('-')}`,
          formatResearchWatchDelivery(
            watch,
            live.map((index) => fired[index])
          )
        )
      : null
  return {
    ...watch,
    fired: fired.map((event, index) => {
      if (expired.includes(index)) {
        return {
          ...event,
          delivery: { ...event.delivery, state: 'expired', detail: 'not delivered within a day' }
        }
      }
      if (!live.includes(index) || !outcome) {
        return event
      }
      return {
        ...event,
        delivery: {
          state: outcome.state === 'delivered' ? 'delivered' : 'pending',
          attempts: event.delivery.attempts + 1,
          lastAttemptAt: at,
          deliveredAt: outcome.state === 'delivered' ? at : null,
          detail: outcome.detail.slice(0, 400)
        }
      }
    })
  }
}

export function researchWatchNeedsDelivery(watch: ResearchRunWatch): boolean {
  return watch.fired.some((event) => !event.notifiedAt || event.delivery.state === 'pending')
}
