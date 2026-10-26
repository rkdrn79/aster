import type { AgentStatusOrchestrationContext } from '../../../../shared/agent-status-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { Tab } from '../../../../shared/tab-types'
import type { AppState } from '@/store/types'

type WorkerContextSources = Pick<
  AppState,
  'runtimeAgentOrchestrationByPaneKey' | 'agentStatusByPaneKey' | 'retainedAgentsByPaneKey'
>

/** Keep lineage while a worker's host status arrives before its runtime roster. */
export function researchOrchestrationWorkerContexts(
  state: WorkerContextSources
): Record<string, AgentStatusOrchestrationContext> {
  const contexts: Record<string, AgentStatusOrchestrationContext> = {}
  for (const [paneKey, retained] of Object.entries(state.retainedAgentsByPaneKey)) {
    if (retained.entry.orchestration) {
      contexts[paneKey] = retained.entry.orchestration
    }
  }
  for (const [paneKey, live] of Object.entries(state.agentStatusByPaneKey)) {
    if (live.orchestration) {
      contexts[paneKey] = live.orchestration
    }
  }
  return { ...contexts, ...state.runtimeAgentOrchestrationByPaneKey }
}

/** A worker belongs to its parent chat only when both tabs are present on the same host. */
export function researchOrchestrationWorkerTabIds(
  tabs: readonly Tab[],
  allTabs: readonly Tab[],
  orchestration: Readonly<Record<string, AgentStatusOrchestrationContext>>,
  ownerOf: (tab: Tab) => string | null
): ReadonlySet<string> {
  const tabsById = new Map(allTabs.map((tab) => [tab.id, tab]))
  const candidateIds = new Set(tabs.map((tab) => tab.id))
  const workers = new Set<string>()
  for (const [paneKey, context] of Object.entries(orchestration)) {
    const childId = parsePaneKey(paneKey)?.tabId
    const parentId = context.parentPaneKey ? parsePaneKey(context.parentPaneKey)?.tabId : null
    if (!childId || !parentId || childId === parentId || !candidateIds.has(childId)) {
      continue
    }
    const child = tabsById.get(childId)
    const parent = tabsById.get(parentId)
    if (
      (child?.contentType === 'agent-session' || child?.contentType === 'terminal') &&
      (parent?.contentType === 'agent-session' ||
        (parent?.contentType === 'terminal' && parent.viewMode === 'chat')) &&
      ownerOf(child) !== null &&
      ownerOf(child) === ownerOf(parent)
    ) {
      workers.add(childId)
    }
  }
  return workers
}
