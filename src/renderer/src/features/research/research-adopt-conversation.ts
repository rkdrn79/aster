import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { normalizeDisabledTuiAgents } from '../../../../shared/tui-agent-selection'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/runtime-client-target'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { useResearchRecords } from './research-records-store'
import { trackDelegationLaunch } from './research-delegation-launch'
import { nameResearchChat } from './research-chat-label'

// Why: the bundled adopt guide supports these agents; never silently switch to Claude.
const SKILL_AGENTS = new Set<TuiAgent>(['claude', 'codex'])

const ADOPT_DELEGATION_TASK = 'Organize project folders'

/** Unattended: the user is not watching this chat, so the skill works on its own branch. */
const ADOPT_PROMPT =
  'Use the aster-research-adopt skill on this host. If it is not installed, read its full guide ' +
  'with this host\'s Aster CLI (`"$ORCA_CLI_COMMAND" skills get aster-research-adopt --full` ' +
  'on Unix) before changing files. If the guide is ' +
  "unavailable, stop and report that instead of guessing. Follow it in unattended mode to reorganize this project into Aster's " +
  '.aster/ layout. I started this from a button in Aster and am not watching this chat, so do ' +
  'not wait for plan approval.'

type AdoptAgentSettings = {
  defaultTuiAgent?: unknown
  disabledTuiAgents?: unknown
}

export async function resolveResearchAdoptAgent(hostId: ExecutionHostId): Promise<TuiAgent> {
  const target = ipcOrRuntimeTargetForHostId(hostId)
  if (!target) {
    throw new Error('The project host is unavailable. Reconnect it and try again.')
  }
  const settings: AdoptAgentSettings =
    target.kind === 'local'
      ? (useAppStore.getState().settings ?? {})
      : (
          await callRuntimeRpc<{ settings: AdoptAgentSettings }>(
            target,
            'settings.get',
            undefined,
            { timeoutMs: 15_000 }
          )
        ).settings
  const preferred = settings.defaultTuiAgent
  if (
    !isTuiAgent(preferred) ||
    normalizeDisabledTuiAgents(settings.disabledTuiAgents).includes(preferred)
  ) {
    throw new Error('Set an available default agent on the project host before organizing.')
  }
  if (!SKILL_AGENTS.has(preferred)) {
    throw new Error(
      `The project host's default agent (${preferred}) does not support the research adopt guide. Choose Claude Code or Codex there.`
    )
  }
  return preferred
}

/** Starts the adopt agent in a chat that does not take focus; Background agent tasks shows its status. */
export async function startResearchAdoptInBackground(): Promise<void> {
  const state = useAppStore.getState()
  const context = selectResearchWorkspaceContext(state)
  const { workspaceId, hostId } = context
  if (!workspaceId || !hostId) {
    return
  }
  let agent: TuiAgent
  try {
    agent = await resolveResearchAdoptAgent(hostId)
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Could not read the project host agent.')
    return
  }
  const current = selectResearchWorkspaceContext(useAppStore.getState())
  if (current.workspaceId !== workspaceId || current.hostId !== hostId) {
    return
  }
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    requestedSurface: 'chat',
    selectedExecutionHostId: hostId,
    agent,
    worktreeId: workspaceId,
    prompt: ADOPT_PROMPT,
    promptDelivery: 'auto-submit',
    // Why: the fallback terminal of a background launch drops the prompt, so record a failure.
    onStructuredHostDeclined: () => ({ opened: false }),
    activate: false
  })
  if (!result) {
    toast.error('Could not start the organizing agent. Check the agent in Settings.')
    return
  }
  nameResearchChat(workspaceId, result, ADOPT_DELEGATION_TASK)
  const now = new Date().toISOString()
  const delegation: ResearchDelegationRecord = {
    id: createBrowserUuid(),
    sourceWorkspaceId: workspaceId,
    sourceHostId: hostId,
    sourceExperimentId: null,
    targetWorkspaceId: workspaceId,
    targetHostId: hostId,
    targetLabel: context.workspaceName ?? context.projectName ?? 'This workspace',
    agent,
    task: ADOPT_DELEGATION_TASK,
    tabId: result.surface.kind === 'host-published' ? null : result.surface.tabId,
    sessionId: null,
    state: 'launching',
    createdAt: now,
    updatedAt: now
  }
  try {
    await useResearchRecords.getState().update((current) => ({
      ...current,
      delegations: [delegation, ...current.delegations].slice(0, 500)
    }))
  } catch (cause) {
    toast.error(`The agent started, but its progress cannot be shown: ${String(cause)}`)
    return
  }
  trackDelegationLaunch(delegation.id, result)
  toast.success(
    `Organizing with ${agent === 'codex' ? 'Codex' : 'Claude Code'} on the project host. Follow it under Background agent tasks.`
  )
}
