import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore, type AppState } from '@/store'
import { useNow } from '@/hooks/use-now'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { runtimeHostContactForEntry } from '../../../../shared/runtime-host-contact'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import type { Tab } from '../../../../shared/tab-types'
import {
  researchDelegationActivity,
  researchDelegationIsActive,
  researchDelegationIsLive,
  type ResearchDelegationActivity
} from './research-delegation-lifecycle'
import { useResearchDelegationDismissals } from './research-delegation-dismissals'

export type ResearchDelegationRow = {
  delegation: ResearchDelegationRecord
  /** The tab a delegated launch opened, once its host shows it here. */
  tab: Tab | undefined
  status: AgentStatusEntry | null
  reachable: boolean
  activity: ResearchDelegationActivity
  live: boolean
  active: boolean
}

function delegationTab(state: AppState, delegation: ResearchDelegationRecord): Tab | undefined {
  return state.unifiedTabsByWorktree[delegation.targetWorkspaceId]?.find(
    (entry) =>
      (!entry.executionHostId || entry.executionHostId === delegation.targetHostId) &&
      (entry.id === delegation.tabId ||
        (delegation.sessionId !== null && entry.entityId === delegation.sessionId))
  )
}

function tabAgentStatus(state: AppState, tab: Tab | undefined): AgentStatusEntry | null {
  if (!tab) {
    return null
  }
  return (
    Object.values(state.agentStatusByPaneKey).find(
      (entry) => entry.tabId === tab.id || entry.paneKey.startsWith(`${tab.id}:`)
    ) ?? null
  )
}

function hostReachable(state: AppState, delegation: ResearchDelegationRecord): boolean {
  const host = parseExecutionHostId(delegation.targetHostId)
  if (host?.kind === 'local') {
    return true
  }
  if (host?.kind === 'ssh') {
    return state.sshConnectionStates.get(host.targetId)?.status === 'connected'
  }
  if (host?.kind === 'runtime') {
    return (
      runtimeHostContactForEntry(state.runtimeStatusByEnvironmentId.get(host.environmentId))
        .verdict === 'live'
    )
  }
  return false
}

/** Each delegated task with what its tab, agent, and host currently say about it. */
export function useResearchDelegationRows(
  delegations: readonly ResearchDelegationRecord[]
): ResearchDelegationRow[] {
  const tabs = useAppStore(
    useShallow((state) => delegations.map((delegation) => delegationTab(state, delegation)))
  )
  const statuses = useAppStore(useShallow((state) => tabs.map((tab) => tabAgentStatus(state, tab))))
  const reachable = useAppStore(
    useShallow((state) => delegations.map((delegation) => hostReachable(state, delegation)))
  )
  const dismissals = useResearchDelegationDismissals()
  // Why: a minute tick ages out tasks nobody has heard from; a timer ends each "Done" on time.
  const minuteClock = useNow(60_000)
  const [doneCheckedAt, setDoneCheckedAt] = useState(0)
  const now = Math.max(minuteClock, doneCheckedAt)
  const rows = delegations.map((delegation, index): ResearchDelegationRow => {
    const tab = tabs[index]
    const status = statuses[index] ?? null
    const activity = researchDelegationActivity({
      delegation,
      status,
      reachable: reachable[index] ?? false,
      tabOpen: tab !== undefined,
      now
    })
    const dismissedAt = dismissals[delegation.id]
    return {
      delegation,
      tab,
      status,
      reachable: reachable[index] ?? false,
      activity,
      live: researchDelegationIsLive(activity, dismissedAt),
      active: researchDelegationIsActive(activity, dismissedAt)
    }
  })
  const nextLeave = Math.min(...rows.map((row) => row.activity.leavesAt ?? Infinity))
  useEffect(() => {
    if (!Number.isFinite(nextLeave)) {
      return
    }
    const timer = setTimeout(
      () => setDoneCheckedAt(Date.now()),
      Math.max(0, nextLeave - Date.now()) + 50
    )
    return () => clearTimeout(timer)
  }, [nextLeave])
  return rows
}
