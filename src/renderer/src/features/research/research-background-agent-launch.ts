import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import type {
  ResearchBackgroundDelegation,
  ResearchBackgroundLaunch,
  ResearchWindowActionResult
} from '../../../../shared/research-window-actions'
import { nameResearchChat } from './research-chat-label'
import { trackDelegationLaunch } from './research-delegation-launch'
import { useResearchRecords } from './research-records-store'
import { researchWindowSurfaceTarget } from './research-window-surface'

/**
 * Starts an agent in the background (a research loop, a judge, a delegation, a PDF revision) and
 * lists it under Background tasks. A research window asks the main window, which owns the tabs:
 * a tab made in the window's copy of the state would be overwritten and its prompt never sent.
 */
export function launchResearchBackgroundAgent(
  launch: ResearchBackgroundLaunch,
  delegation: ResearchBackgroundDelegation
): Promise<ResearchWindowActionResult> {
  if (researchWindowSurfaceTarget()) {
    return window.api.researchWindow.runAction({
      kind: 'launch-background-agent',
      launch,
      delegation
    })
  }
  return runResearchBackgroundAgent(launch, delegation)
}

/** The main window's half: start the agent here, record its Background task, follow how it settles. */
export async function runResearchBackgroundAgent(
  launch: ResearchBackgroundLaunch,
  delegation: ResearchBackgroundDelegation
): Promise<ResearchWindowActionResult> {
  const host = parseExecutionHostId(launch.hostId)
  if (!host) {
    return { ok: false, stage: 'launch', error: 'This host cannot start an agent.' }
  }
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    requestedSurface: launch.surface,
    selectedExecutionHostId: host.id,
    agent: launch.agent,
    worktreeId: launch.workspaceId,
    prompt: launch.prompt,
    promptDelivery: launch.promptDelivery,
    // Why: the fallback terminal of a background launch drops the prompt, so record a failure.
    ...(launch.noFallbackTerminal ? { onStructuredHostDeclined: () => ({ opened: false }) } : {}),
    activate: false
  })
  if (!result) {
    return { ok: false, stage: 'launch', error: 'The agent could not start on this host.' }
  }
  if (launch.label) {
    nameResearchChat(launch.workspaceId, result, launch.label)
  }
  const now = new Date().toISOString()
  const record: ResearchDelegationRecord = {
    ...delegation,
    tabId: result.surface.kind === 'host-published' ? null : result.surface.tabId,
    sessionId: null,
    state: 'launching',
    createdAt: now,
    updatedAt: now
  }
  try {
    await useResearchRecords.getState().update((current) => ({
      ...current,
      delegations: [record, ...current.delegations].slice(0, 500)
    }))
  } catch (cause) {
    return { ok: false, stage: 'record', error: String(cause) }
  }
  trackDelegationLaunch(record.id, result)
  return { ok: true, delegationId: record.id }
}
