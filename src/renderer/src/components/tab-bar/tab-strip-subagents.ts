import { parsePaneKey } from '../../../../shared/stable-pane-id'
import {
  orchestrationWorkersOf,
  type NativeChatOrchestrationWorker
} from '../native-chat/native-chat-orchestration-workers'

type WorkerSources = Parameters<typeof orchestrationWorkersOf>[0]

/** Workers launched from the strip's tabs, including workers of those workers, so a nested
 *  helper stays reachable even though its own parent is folded away too. */
export function tabStripSubagents(
  sources: WorkerSources,
  parentTabIds: Iterable<string>
): NativeChatOrchestrationWorker[] {
  const owners = new Set(parentTabIds)
  if (owners.size === 0) {
    return []
  }
  let workers: NativeChatOrchestrationWorker[] = []
  let ownerCount = -1
  while (ownerCount !== owners.size) {
    ownerCount = owners.size
    workers = orchestrationWorkersOf(sources, (parentPaneKey) => {
      const parentTabId = parsePaneKey(parentPaneKey)?.tabId
      return parentTabId !== undefined && owners.has(parentTabId)
    })
    for (const worker of workers) {
      const tabId = parsePaneKey(worker.paneKey)?.tabId
      if (tabId) {
        owners.add(tabId)
      }
    }
  }
  // Why: launch order keeps rows from jumping as the host republishes its roster.
  return workers.sort(
    (left, right) =>
      (left.tab?.createdAt ?? Number.MAX_SAFE_INTEGER) -
      (right.tab?.createdAt ?? Number.MAX_SAFE_INTEGER)
  )
}
