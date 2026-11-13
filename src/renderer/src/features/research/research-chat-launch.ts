import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { StructuredAgentSessionResumeSource } from '../../../../shared/structured-agent-session-create'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { workspaceKindForWorktreeId } from '../../../../shared/workspace-launch-kind'
import { useAppStore } from '@/store'
import { launchAgentInNewTab, type LaunchAgentInNewTabArgs } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { planAgentSessionLaunch } from '@/lib/agent-session-launch-plan'
import { researchWindowSurfaceTarget } from './research-window-surface'
import { launchResearchChatThroughMainWindow } from './research-window-chat-launch'
import { nameResearchChat } from './research-chat-label'

export type ResearchChatLaunchResult = { sessionId: string } | { error: string }

export type ResearchChatLaunchInput = {
  hostId: string
  workspaceId: string
  agent: TuiAgent
  prompt?: string
  /** The chat's title, so it never comes from the prompt Aster wrote. */
  label: string
  /** For chats a Library or Writing pane shows, so the Workbench keeps its own tab. */
  activate?: false
  /** A copy of a conversation the chat takes over, as a branch does. */
  resumeFrom?: Pick<StructuredAgentSessionResumeSource, 'providerSessionId'>
}

/** Starts a structured chat tab in the workspace; an optional first prompt is submitted once ready. */
export async function launchResearchChat(
  input: ResearchChatLaunchInput
): Promise<ResearchChatLaunchResult> {
  const windowTarget = researchWindowSurfaceTarget()
  if (windowTarget) {
    // Why: the main window owns the tabs; a chat made here would vanish with this window's copy.
    return launchResearchChatThroughMainWindow(windowTarget, input)
  }
  const host = parseExecutionHostId(input.hostId)
  if (!host) {
    return { error: 'This workspace host cannot start an agent chat.' }
  }
  const common = {
    agent: input.agent,
    worktreeId: input.workspaceId,
    ...(input.activate === false ? { activate: false } : {})
  }
  const prompt = input.prompt
    ? { prompt: input.prompt, promptDelivery: 'auto-submit' as const }
    : {}
  const args: LaunchAgentInNewTabArgs = input.resumeFrom
    ? {
        ...common,
        // Decided here: a chat that takes over a conversation never falls back to a terminal.
        agentSessionLaunchPlan: planAgentSessionLaunch(useAppStore.getState(), {
          requestId: newAgentLaunchRequestId(),
          requestedSurface: 'chat',
          selectedExecutionHostId: host.id,
          agent: input.agent,
          workspace: {
            kind: workspaceKindForWorktreeId(input.workspaceId),
            worktreeId: input.workspaceId
          },
          resumeFrom: { providerSessionId: input.resumeFrom.providerSessionId },
          ...prompt
        })
      }
    : {
        ...common,
        requestId: newAgentLaunchRequestId(),
        requestedSurface: 'chat',
        selectedExecutionHostId: host.id,
        ...prompt
      }
  const result = launchAgentInNewTab(args)
  if (!result?.structuredSettlement) {
    return { error: 'A structured agent chat could not be started. Choose an existing chat.' }
  }
  nameResearchChat(input.workspaceId, result, input.label)
  const settled = await result.structuredSettlement
  if (settled.kind !== 'structured') {
    return { error: 'The agent chat did not become ready. Choose an existing chat or retry.' }
  }
  return { sessionId: settled.sessionId }
}
