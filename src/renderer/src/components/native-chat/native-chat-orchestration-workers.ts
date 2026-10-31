import type { AppState } from '@/store/types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { Tab } from '../../../../shared/tab-types'
import { researchOrchestrationWorkerContexts } from '@/features/research/research-orchestration-worker-tabs'

type WorkerState =
  | 'pending'
  | 'dispatched'
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'failed'

export const ORCHESTRATION_WORKER_STATE_LABELS: Record<WorkerState, string> = {
  pending: 'Pending',
  dispatched: 'Dispatched',
  working: 'Working',
  waiting: 'Waiting',
  blocked: 'Needs input',
  completed: 'Completed',
  failed: 'Failed'
}

export type NativeChatOrchestrationWorker = {
  paneKey: string
  parentPaneKey: string
  name: string
  state: WorkerState
  tab: Tab | null
  /** Current tool, else the latest reply preview, from the worker's own status feed. */
  activity: string | null
  updatedAt: number | null
}

type WorkerSources = Pick<
  AppState,
  | 'runtimeAgentOrchestrationByPaneKey'
  | 'agentStatusByPaneKey'
  | 'retainedAgentsByPaneKey'
  | 'unifiedTabsByWorktree'
>

/** Independent Aster workers whose host-recorded parent pane passes `isParentPane`. */
export function orchestrationWorkersOf(
  sources: WorkerSources,
  isParentPane: (parentPaneKey: string) => boolean
): NativeChatOrchestrationWorker[] {
  const contexts = Object.entries(researchOrchestrationWorkerContexts(sources))
  if (contexts.length === 0) {
    return []
  }
  const tabs = new Map(
    Object.values(sources.unifiedTabsByWorktree)
      .flat()
      .map((tab) => [tab.id, tab] as const)
  )
  const workers: NativeChatOrchestrationWorker[] = []
  for (const [paneKey, context] of contexts) {
    const parentPaneKey = context.parentPaneKey
    if (!parentPaneKey || !isParentPane(parentPaneKey)) {
      continue
    }
    const childTabId = parsePaneKey(paneKey)?.tabId
    if (!childTabId || childTabId === parsePaneKey(parentPaneKey)?.tabId) {
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
    const status = live ?? retained
    const tab = tabs.get(childTabId) ?? null
    workers.push({
      paneKey,
      parentPaneKey,
      name: context.displayName ?? context.taskTitle ?? tab?.label ?? 'Subagent',
      state,
      tab,
      activity: status?.toolName
        ? [status.toolName, status.toolInput].filter(Boolean).join(' ')
        : status?.lastAssistantMessage || null,
      updatedAt: status?.updatedAt ?? null
    })
  }
  return workers
}

/** Independent Aster workers linked to this chat by the host's pane-level parent identity. */
export function nativeChatOrchestrationWorkers(
  sources: WorkerSources,
  parentPaneKey: string
): NativeChatOrchestrationWorker[] {
  return orchestrationWorkersOf(sources, (candidate) => candidate === parentPaneKey)
}

export type OrchestrationWorkerSummary = {
  running: number
  waiting: number
  failed: number
  done: number
}

export function summarizeOrchestrationWorkers(
  workers: readonly Pick<NativeChatOrchestrationWorker, 'state'>[]
): OrchestrationWorkerSummary {
  const summary = { running: 0, waiting: 0, failed: 0, done: 0 }
  for (const { state } of workers) {
    if (state === 'waiting' || state === 'blocked') {
      summary.waiting += 1
    } else if (state === 'failed') {
      summary.failed += 1
    } else if (state === 'completed') {
      summary.done += 1
    } else {
      summary.running += 1
    }
  }
  return summary
}

const SUMMARY_ORDER = ['running', 'waiting', 'failed', 'done'] as const

/** "2 running · 1 waiting", listing only non-zero groups; `noun` names the first count
 *  ("2 subagents running · 1 waiting"). */
export function orchestrationWorkerSummaryLabel(
  summary: OrchestrationWorkerSummary,
  noun?: { one: string; other: string }
): string {
  return SUMMARY_ORDER.filter((key) => summary[key] > 0)
    .map((key, index) => {
      const count = summary[key]
      const word = noun && index === 0 ? ` ${count === 1 ? noun.one : noun.other}` : ''
      return `${count}${word} ${key}`
    })
    .join(' · ')
}
