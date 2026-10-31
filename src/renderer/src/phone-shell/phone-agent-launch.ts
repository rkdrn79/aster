import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import type { NewTabAgentMenuRow } from '@/lib/new-tab-agent-menu-rows'
import { findStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import { useAppStore } from '@/store'
import { formatAgentTypeLabel } from '../../../shared/agent-type-label'
import {
  phoneAgentLaunchFailureText,
  phoneChatLaunchFailureText
} from './phone-agent-launch-failure'

export type PhoneLaunchableAgentRow = Exclude<NewTabAgentMenuRow, { kind: 'chat-unavailable' }>

export type PhoneAgentLaunchOutcome =
  | { status: 'started'; tabId: string | null }
  /** `message` is null when the launch already told the user why. */
  | { status: 'failed'; message: string | null }

const CHAT_TAB_WAIT_MS = 10_000

/** The new chat's tab once this client mirrors it; null if it has not within the wait. */
function waitForChatTab(worktreeId: string, sessionId: string): Promise<string | null> {
  const find = (): string | null =>
    findStructuredAgentSessionTab(useAppStore.getState().unifiedTabsByWorktree, {
      workspaceId: worktreeId,
      sessionId
    })?.id ?? null
  const found = find()
  if (found) {
    return Promise.resolve(found)
  }
  return new Promise((resolve) => {
    let stop = (): void => {}
    const timer = setTimeout(() => {
      stop()
      resolve(null)
    }, CHAT_TAB_WAIT_MS)
    stop = useAppStore.subscribe(() => {
      const tabId = find()
      if (tabId) {
        clearTimeout(timer)
        stop()
        resolve(tabId)
      }
    })
  })
}

/**
 * Starts an agent the way the desktop's quick-launch menu does, then waits for the host's answer
 * so the phone can open the session, or say why the host refused it.
 */
export async function launchPhoneAgent(args: {
  row: PhoneLaunchableAgentRow
  worktreeId: string
  prompt: string
}): Promise<PhoneAgentLaunchOutcome> {
  const { row } = args
  const prompt = args.prompt.trim()
  const label = formatAgentTypeLabel(row.agent)
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    ...(row.kind === 'chat' || row.kind === 'cli'
      ? {
          requestedSurface: row.kind === 'chat' ? ('chat' as const) : ('terminal' as const),
          selectedExecutionHostId: row.executionHostId
        }
      : {}),
    agent: row.agent,
    worktreeId: args.worktreeId,
    ...(prompt ? { prompt } : {}),
    launchSource: 'mobile',
    // Why: the New agent screen shows the failure inline, so a toast would say it twice.
    notifyFailure: false
  })
  if (!result) {
    return {
      status: 'failed',
      message: `Aster couldn’t build a launch command for ${label}.`
    }
  }
  if (result.surface.kind !== 'host-published') {
    return { status: 'started', tabId: result.surface.tabId }
  }
  if (result.terminalCompletion) {
    const completion = await result.terminalCompletion
    return completion.outcome.status === 'failed'
      ? {
          status: 'failed',
          message: phoneAgentLaunchFailureText(completion.outcome.message, label)
        }
      : { status: 'started', tabId: completion.tabId ?? null }
  }
  if (result.structuredSettlement) {
    const settlement = await result.structuredSettlement
    if (settlement.kind === 'failed') {
      // Why: a chat launch that already toasted its failure leaves the form without a second note.
      return settlement.notified
        ? { status: 'failed', message: null }
        : { status: 'failed', message: phoneChatLaunchFailureText(settlement.error, label) }
    }
    if (settlement.kind === 'cancelled') {
      return { status: 'failed', message: `The ${label} chat was cancelled before it started.` }
    }
    // Why: without the chat's own tab the phone would open whatever the workspace shows.
    if (settlement.kind === 'structured' || settlement.kind === 'visibility-unknown') {
      return {
        status: 'started',
        tabId: await waitForChatTab(args.worktreeId, settlement.sessionId)
      }
    }
  }
  return { status: 'started', tabId: null }
}
