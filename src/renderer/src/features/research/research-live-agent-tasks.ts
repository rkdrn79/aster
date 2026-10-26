import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { isAgentStatusFresh } from '../../../../shared/agent-status-freshness'
import type { Tab } from '../../../../shared/tab-types'

export type ResearchLiveAgentTask = {
  id: string
  name: string
  detail: string | null
  state: string
  /** Running or waiting on the user, as opposed to idle or of unknown state. */
  active: boolean
  observedAt: number
  parentLabel: string
  tab: Tab | null
  workspaceId: string | null
}

const MAX_TASKS = 100
const ACTIVE_STATES = new Set(['working', 'monitoring', 'waiting', 'blocked'])

export function researchLiveTaskDismissalKey(id: string): string {
  return `child:${id}`
}

function parentTab(
  status: AgentStatusEntry,
  tabsByWorkspace: Record<string, Tab[]>
): { tab: Tab; workspaceId: string } | null {
  if (!status.tabId) {
    return null
  }
  if (status.worktreeId) {
    const tab = tabsByWorkspace[status.worktreeId]?.find(
      (candidate) => candidate.id === status.tabId
    )
    if (tab) {
      return { tab, workspaceId: status.worktreeId }
    }
  }
  for (const [workspaceId, tabs] of Object.entries(tabsByWorkspace)) {
    const tab = tabs.find((candidate) => candidate.id === status.tabId)
    if (tab) {
      return { tab, workspaceId }
    }
  }
  return null
}

/**
 * Child work open agents report as live. A finished child leaves at once, and so does every
 * child of an agent not heard from for the freshness window, so "Status unavailable" never sticks.
 */
export function researchLiveAgentTasks(
  statuses: Record<string, AgentStatusEntry>,
  tabsByWorkspace: Record<string, Tab[]>,
  now = Date.now(),
  dismissals: Readonly<Record<string, number>> = {}
): ResearchLiveAgentTask[] {
  const rows: ResearchLiveAgentTask[] = []
  for (const status of Object.values(statuses)) {
    if (!isAgentStatusFresh(status, now)) {
      continue
    }
    const parent = parentTab(status, tabsByWorkspace)
    const verified = status.subagentObservation !== 'unverifiable'
    const parentLabel =
      parent?.tab.customLabel || parent?.tab.label || status.terminalTitle || 'Agent'
    const shared = {
      parentLabel,
      tab: parent?.tab ?? null,
      workspaceId: parent?.workspaceId ?? null
    }
    if (status.children) {
      for (const child of status.children) {
        if (child.membership !== 'live' || child.state === 'done' || child.state === 'idle') {
          continue
        }
        rows.push({
          id: `${status.paneKey}:${child.id}`,
          name: child.name || child.agentType || child.description || child.kind,
          detail: child.lastMessage || child.description || null,
          state: verified ? child.state : 'Status unavailable',
          active: verified && ACTIVE_STATES.has(child.state),
          observedAt: child.observedAt,
          ...shared
        })
      }
    } else {
      for (const child of status.subagents ?? []) {
        if (child.state === 'idle') {
          continue
        }
        rows.push({
          id: `${status.paneKey}:${child.id}`,
          name: child.agentType || child.description || 'Subagent',
          detail: child.description || null,
          state: verified ? child.state : 'Status unavailable',
          active: verified && ACTIVE_STATES.has(child.state),
          observedAt: status.evidenceObservedAt ?? status.updatedAt,
          ...shared
        })
      }
    }
    if (rows.length >= MAX_TASKS) {
      break
    }
  }
  return rows.filter(
    (task) => (dismissals[researchLiveTaskDismissalKey(task.id)] ?? -Infinity) < task.observedAt
  )
}

/** How many reported child tasks are running or waiting on the user; a stable number to select. */
export function researchActiveAgentTaskCount(
  statuses: Record<string, AgentStatusEntry>,
  now = Date.now(),
  dismissals: Readonly<Record<string, number>> = {}
): number {
  return researchLiveAgentTasks(statuses, {}, now, dismissals).filter((task) => task.active).length
}
