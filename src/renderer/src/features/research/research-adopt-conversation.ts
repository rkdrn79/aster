import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { useResearchRecords } from './research-records-store'
import { trackDelegationLaunch } from './research-delegation-launch'
import { nameResearchChat } from './research-chat-label'

// Why: config/scripts/install-aster-research-skill.sh installs the skill for these two agents.
const SKILL_AGENTS = new Set<TuiAgent>(['claude', 'codex'])

const ADOPT_DELEGATION_TASK = 'Organize project folders'

/** Unattended: the user is not watching this chat, so the skill works on its own branch. */
const ADOPT_PROMPT =
  "Use the aster-research-adopt skill in unattended mode to reorganize this project into Aster's " +
  '.aster/ layout. I started this from a button in Aster and am not watching this chat, so do ' +
  'not wait for plan approval.'

/** Starts the adopt agent in a chat that does not take focus; Background agent tasks shows its status. */
export async function startResearchAdoptInBackground(): Promise<void> {
  const state = useAppStore.getState()
  const context = selectResearchWorkspaceContext(state)
  const { workspaceId, hostId } = context
  if (!workspaceId || !hostId) {
    return
  }
  const preferred = state.settings?.defaultTuiAgent
  const agent: TuiAgent =
    preferred && preferred !== 'blank' && SKILL_AGENTS.has(preferred) ? preferred : 'claude'
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
    'Organizing in the background on a new git branch. Follow it under Background agent tasks.'
  )
}
