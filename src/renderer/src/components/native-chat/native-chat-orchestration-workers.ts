import type { AppState } from '@/store/types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { Tab } from '../../../../shared/tab-types'

type WorkerState =
  | 'pending'
  | 'dispatched'
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'failed'

export type NativeChatOrchestrationWorker = {
  paneKey: string
  name: string
  state: WorkerState
  tab: Tab | null
}

type WorkerSources = Pick<
  AppState,
  | 'runtimeAgentOrchestrationByPaneKey'
  | 'agentStatusByPaneKey'
  | 'retainedAgentsByPaneKey'
  | 'unifiedTabsByWorktree'
>

/** Independent Aster workers linked to this chat by the host's pane-level parent identity. */
export function nativeChatOrchestrationWorkers(
  sources: WorkerSources,
  parentPaneKey: string
): NativeChatOrchestrationWorker[] {
  const contexts = new Map(Object.entries(sources.runtimeAgentOrchestrationByPaneKey))
  for (const [paneKey, entry] of Object.entries(sources.agentStatusByPaneKey)) {
    if (entry.orchestration && !contexts.has(paneKey)) {
      contexts.set(paneKey, entry.orchestration)
    }
  }
  for (const [paneKey, retained] of Object.entries(sources.retainedAgentsByPaneKey)) {
    if (retained.entry.orchestration && !contexts.has(paneKey)) {
      contexts.set(paneKey, retained.entry.orchestration)
    }
  }
  const tabs = new Map(
    Object.values(sources.unifiedTabsByWorktree)
      .flat()
      .map((tab) => [tab.id, tab] as const)
  )
  const parentTabId = parsePaneKey(parentPaneKey)?.tabId
  const workers: NativeChatOrchestrationWorker[] = []
  for (const [paneKey, context] of contexts) {
    if (context.parentPaneKey !== parentPaneKey) {
      continue
    }
    const childTabId = parsePaneKey(paneKey)?.tabId
    if (!childTabId || childTabId === parentTabId) {
      continue
    }
    const live = sources.agentStatusByPaneKey[paneKey]
    const retained = sources.retainedAgentsByPaneKey[paneKey]?.entry
    const state: WorkerState =
      context.dispatchStatus === 'failed' || context.dispatchStatus === 'circuit_broken'
        ? 'failed'
        : context.dispatchStatus === 'completed'
          ? 'completed'
          : live?.state === 'blocked'
            ? 'blocked'
            : live?.state === 'waiting'
              ? 'waiting'
              : live?.state === 'working'
                ? 'working'
                : context.dispatchStatus === 'dispatched'
                  ? 'dispatched'
                  : retained?.state === 'done'
                    ? 'completed'
                    : 'pending'
    const tab = tabs.get(childTabId) ?? null
    workers.push({
      paneKey,
      name: context.displayName ?? context.taskTitle ?? tab?.label ?? 'Subagent',
      state,
      tab
    })
  }
  return workers
}
