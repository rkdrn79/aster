import type { AgentStatusOrchestrationContext } from '../../../../shared/agent-status-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import type { AppState } from '@/store/types'

type WorkerContextSources = Pick<
  AppState,
  | 'runtimeAgentOrchestrationByPaneKey'
  | 'agentStatusByPaneKey'
  | 'retainedAgentsByPaneKey'
  | 'unifiedTabsByWorktree'
>
type OrchestrationLineage = Record<string, AgentStatusOrchestrationContext>

const NO_WORKERS: ReadonlySet<string> = new Set()

/** Rows naming a chat by session move to this client's own tab for it, whatever its id. */
function rekeyChatOrchestrationLineage(
  lineage: OrchestrationLineage,
  tabsByWorktree: Readonly<Record<string, readonly Tab[]>>
): OrchestrationLineage {
  const named = new Set<string>()
  for (const context of Object.values(lineage)) {
    for (const sessionId of [context.agentSessionId, context.parentAgentSessionId]) {
      if (sessionId) {
        named.add(sessionId)
      }
    }
  }
  if (named.size === 0) {
    return lineage
  }
  const chatPaneBySession = new Map<string, string>()
  for (const tabs of Object.values(tabsByWorktree)) {
    for (const tab of tabs) {
      if (
        tab.contentType === 'agent-session' &&
        named.has(tab.entityId) &&
        !chatPaneBySession.has(tab.entityId)
      ) {
        chatPaneBySession.set(tab.entityId, structuredAgentSessionPaneKey(tab.id, tab.entityId))
      }
    }
  }
  const rekeyed: OrchestrationLineage = {}
  for (const [paneKey, context] of Object.entries(lineage)) {
    const ownPaneKey = context.agentSessionId && chatPaneBySession.get(context.agentSessionId)
    const parentPaneKey =
      context.parentAgentSessionId && chatPaneBySession.get(context.parentAgentSessionId)
    rekeyed[ownPaneKey || paneKey] = parentPaneKey ? { ...context, parentPaneKey } : context
  }
  return rekeyed
}

/** Keep lineage while a worker's host status arrives before its runtime roster. Every tab strip
 *  reads this, so an absent status slice means "no lineage", never a render error. */
export function researchOrchestrationWorkerContexts(
  state: Partial<WorkerContextSources>
): OrchestrationLineage {
  const contexts: OrchestrationLineage = {}
  for (const [paneKey, retained] of Object.entries(state.retainedAgentsByPaneKey ?? {})) {
    if (retained.entry.orchestration) {
      contexts[paneKey] = retained.entry.orchestration
    }
  }
  for (const [paneKey, live] of Object.entries(state.agentStatusByPaneKey ?? {})) {
    if (live.orchestration) {
      contexts[paneKey] = live.orchestration
    }
  }
  const merged = { ...contexts, ...state.runtimeAgentOrchestrationByPaneKey }
  return state.unifiedTabsByWorktree
    ? rekeyChatOrchestrationLineage(merged, state.unifiedTabsByWorktree)
    : merged
}

/** A worker belongs to its parent agent only when both tabs are present on the same host. */
export function researchOrchestrationWorkerTabIds(
  tabs: readonly Tab[],
  allTabs: readonly Tab[],
  orchestration: Readonly<Record<string, AgentStatusOrchestrationContext>>,
  ownerOf: (tab: Tab) => string | null
): ReadonlySet<string> {
  const entries = Object.entries(orchestration)
  if (entries.length === 0 || tabs.length === 0) {
    return NO_WORKERS
  }
  const tabsById = new Map(allTabs.map((tab) => [tab.id, tab]))
  const candidateIds = new Set(tabs.map((tab) => tab.id))
  const workers = new Set<string>()
  for (const [paneKey, context] of entries) {
    const childId = parsePaneKey(paneKey)?.tabId
    const parentId = context.parentPaneKey ? parsePaneKey(context.parentPaneKey)?.tabId : null
    if (!childId || !parentId || childId === parentId || !candidateIds.has(childId)) {
      continue
    }
    const child = tabsById.get(childId)
    const parent = tabsById.get(parentId)
    // Why any terminal parent: the tab strip's subagent indicator reaches workers of plain terminals too.
    if (
      (child?.contentType === 'agent-session' || child?.contentType === 'terminal') &&
      (parent?.contentType === 'agent-session' || parent?.contentType === 'terminal') &&
      ownerOf(child) !== null &&
      ownerOf(child) === ownerOf(parent)
    ) {
      workers.add(childId)
    }
  }
  return workers
}

/** Workers fold into their parent's subagent indicator unless pinned or open in a group. */
export function collapsedOrchestrationWorkerTabIds(
  workerTabIds: ReadonlySet<string>,
  tabs: readonly Tab[],
  groups: readonly Pick<TabGroup, 'activeTabId'>[]
): ReadonlySet<string> {
  if (workerTabIds.size === 0) {
    return NO_WORKERS
  }
  const open = new Set(groups.map((group) => group.activeTabId))
  return new Set(
    tabs
      .filter((tab) => workerTabIds.has(tab.id) && !tab.isPinned && !open.has(tab.id))
      .map((tab) => tab.id)
  )
}
