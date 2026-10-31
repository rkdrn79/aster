import { sendMessageToAgent } from '@/lib/agent-message-send'
import {
  deriveNotesSendAgentTargets,
  type NotesSendAgentTarget
} from '@/lib/notes-send-agent-targets'
import { useAppStore } from '@/store'
import type { Tab } from '../../../../shared/tab-types'
import { CLI_NAME } from '../../../../shared/product-brand'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { ResearchAgentIdentity } from '../../../../shared/research/research-quality-findings'
import type { AgentReviewSetup } from './research-agent-review-prompt'
import { researchErrorText } from './research-error-text'
import { researchHarnessBridge } from './use-research-harness-experiment'

/** Where a review runs and records: a workspace and one catalog Experiment in it. */
export type AgentReviewScope = {
  workspaceId: string
  hostId: string
  workspacePath: string
  experiment: string
  /** The Experiment's display name, for the request the chat shows. */
  name?: string
}

export type AgentReviewOutcome = { ok: true } | { ok: false; message: string }

export const CATALOG_ONLY = 'Available for projects with a research catalog.'

// Why: config/scripts/install-aster-research-skill.sh installs the research skills for these two.
const SKILL_AGENTS = new Set<TuiAgent>(['claude', 'codex'])

/**
 * An SSH host's agent runs that host's harness and skills, which its own CLI finds there; this
 * Mac's paths would not exist on it. The brief is read there too.
 */
function remoteAgentReviewSetup(scope: AgentReviewScope): AgentReviewSetup {
  return {
    projectPath: scope.workspacePath,
    experiment: scope.experiment,
    ...(scope.name ? { experimentName: scope.name } : {}),
    cli: `$(${CLI_NAME} research harness-path)`,
    trackSkill: `the output of \`${CLI_NAME} skills get aster-research-track\``,
    verifySkill: `the output of \`${CLI_NAME} skills get aster-research-verify\``,
    brief: null,
    briefError: 'it lives on the SSH host'
  }
}

/** Harness paths plus the Experiment brief; a brief that cannot be read is named, not hidden. */
export async function loadAgentReviewSetup(scope: AgentReviewScope): Promise<AgentReviewSetup> {
  if (scope.hostId !== 'local') {
    return remoteAgentReviewSetup(scope)
  }
  const location = researchHarnessBridge().location
  if (!location) {
    throw new Error('This window cannot reach the research harness. Reload Aster.')
  }
  const harness = await location()
  const show = (window.api.researchBrief ?? {}).show
  let brief: AgentReviewSetup['brief'] = null
  let briefError: string | null = null
  if (!show) {
    briefError = 'this window predates Experiment briefs'
  } else {
    try {
      brief = (await show({ workspacePath: scope.workspacePath, experiment: scope.experiment }))
        .brief
    } catch (cause) {
      briefError = researchErrorText(cause)
    }
  }
  return {
    projectPath: scope.workspacePath,
    experiment: scope.experiment,
    ...(scope.name ? { experimentName: scope.name } : {}),
    cli: harness.cli,
    trackSkill: harness.trackSkill,
    verifySkill: harness.verifySkill,
    brief,
    briefError
  }
}

/** The user's default chat agent when the harness skills support it, else Claude Code. */
export function reviewChatAgent(): TuiAgent {
  const preferred = useAppStore.getState().settings?.defaultTuiAgent
  return preferred && preferred !== 'blank' && SKILL_AGENTS.has(preferred) ? preferred : 'claude'
}

/** The open chat tab of a structured session in a workspace. */
export function researchChatTab(workspaceId: string, sessionId: string): Tab | undefined {
  return (useAppStore.getState().unifiedTabsByWorktree[workspaceId] ?? []).find(
    (tab) => tab.entityId === sessionId
  )
}

/** Shows a research chat tab in the Workbench. */
export function openResearchChatTab(workspaceId: string, sessionId: string): void {
  const tab = researchChatTab(workspaceId, sessionId)
  if (tab) {
    const state = useAppStore.getState()
    state.setActiveView('terminal')
    state.activateTab(tab.id, { worktreeId: workspaceId })
  }
}

/** Sends a message to an open structured chat; null when that chat is not open. */
export async function sendToResearchChat(
  workspaceId: string,
  sessionId: string,
  prompt: string
): Promise<AgentReviewOutcome | null> {
  const tab = researchChatTab(workspaceId, sessionId)
  const target = tab
    ? deriveNotesSendAgentTargets(useAppStore.getState(), workspaceId).find(
        (entry) => entry.tabId === tab.id || entry.tabId === tab.entityId
      )
    : undefined
  return target ? sendAgentReviewMessage(workspaceId, target, prompt) : null
}

function matchesIdentity(
  target: NotesSendAgentTarget,
  identity: ResearchAgentIdentity,
  paneKey: string | null
): boolean {
  if (target.messageTarget.kind === 'structured-session') {
    return target.messageTarget.sessionId === identity.sessionId
  }
  return paneKey !== null && target.paneKey === paneKey
}

/**
 * The live session the harness recorded for an agent, in this workspace or another one such as a
 * loop worker's worktree: its Aster chat session, else its terminal pane (directly or through the
 * terminal handle its status entry reports).
 */
export function recordedAgentTarget(
  workspaceId: string,
  identity: ResearchAgentIdentity | null | undefined
): { workspaceId: string; target: NotesSendAgentTarget } | null {
  if (!identity || (!identity.sessionId && !identity.paneKey && !identity.terminalHandle)) {
    return null
  }
  const state = useAppStore.getState()
  const paneKey =
    identity.paneKey ??
    (identity.terminalHandle
      ? (Object.values(state.agentStatusByPaneKey).find(
          (entry) => entry.terminalHandle === identity.terminalHandle
        )?.paneKey ?? null)
      : null)
  const workspaces = new Set([
    workspaceId,
    ...Object.keys(state.unifiedTabsByWorktree),
    ...Object.keys(state.tabsByWorktree)
  ])
  for (const candidate of workspaces) {
    const target = deriveNotesSendAgentTargets(state, candidate).find((entry) =>
      matchesIdentity(entry, identity, paneKey)
    )
    if (target) {
      return { workspaceId: candidate, target }
    }
  }
  return null
}

export async function sendAgentReviewMessage(
  workspaceId: string,
  target: NotesSendAgentTarget,
  prompt: string
): Promise<AgentReviewOutcome> {
  if (target.status === 'disabled') {
    return { ok: false, message: target.disabledReason ?? 'That agent cannot take a message now.' }
  }
  try {
    const result = await sendMessageToAgent({
      worktreeId: workspaceId,
      target: target.messageTarget,
      prompt
    })
    switch (result.status) {
      case 'sent':
        return { ok: true }
      case 'not-ready':
        return { ok: false, message: 'The agent is not ready for input yet. Try again shortly.' }
      case 'permission':
        return { ok: false, message: 'The agent is waiting on a permission prompt.' }
      case 'unconfirmed':
        return { ok: false, message: 'Delivery could not be confirmed. Check the chat first.' }
      case 'no-active-terminal':
      case 'no-agent':
        return { ok: false, message: 'That agent session is no longer open.' }
      case 'status-unavailable':
      case 'not-writable':
      case 'partial-submit-failed':
      case 'empty':
        return { ok: false, message: 'The agent did not accept the message.' }
    }
  } catch (cause) {
    return { ok: false, message: researchErrorText(cause) }
  }
}
