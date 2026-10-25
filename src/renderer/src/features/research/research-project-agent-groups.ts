import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { Tab } from '../../../../shared/tab-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { ResearchHomeWorkspace } from './research-home-projects'

export type ResearchAgentWorkspace = Pick<
  ResearchHomeWorkspace,
  'id' | 'name' | 'branch' | 'executionHostId' | 'isMain'
>

export type ResearchProjectAgentGroup = {
  workspace: ResearchAgentWorkspace
  hostId: ExecutionHostId | null
  tabs: Tab[]
}

export function collectProjectAgentGroups(
  workspaces: readonly ResearchAgentWorkspace[],
  unifiedTabsByWorktree: Readonly<Record<string, readonly Tab[]>>,
  terminalTabsByWorktree: Readonly<Record<string, readonly TerminalTab[]>>,
  resolveHost: (workspaceId: string) => ExecutionHostId | null
): ResearchProjectAgentGroup[] {
  return [...workspaces]
    .sort(
      (first, second) =>
        Number(second.isMain) - Number(first.isMain) ||
        first.name.localeCompare(second.name) ||
        first.id.localeCompare(second.id)
    )
    .map((workspace) => {
      const hostId = workspace.executionHostId ?? resolveHost(workspace.id)
      const agentTerminalIds = new Set(
        (terminalTabsByWorktree[workspace.id] ?? [])
          .filter((tab) => tab.launchAgent)
          .map((tab) => tab.id)
      )
      const tabs = (unifiedTabsByWorktree[workspace.id] ?? []).filter(
        (tab) =>
          tab.worktreeId === workspace.id &&
          (!hostId || !tab.executionHostId || tab.executionHostId === hostId) &&
          (tab.contentType === 'agent-session' ||
            (tab.contentType === 'terminal' &&
              (tab.viewMode === 'chat' ||
                agentTerminalIds.has(tab.entityId) ||
                agentTerminalIds.has(tab.id))))
      )
      return { workspace, hostId, tabs }
    })
}
