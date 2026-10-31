import {
  summarizeOrchestrationWorkers,
  type NativeChatOrchestrationWorker,
  type OrchestrationWorkerSummary
} from '@/components/native-chat/native-chat-orchestration-workers'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { comparePhoneSessions, type PhoneSession } from './phone-sessions'

/** A listed session with the subagents it launched, workers of those workers included. */
export type PhoneSessionFamily = {
  session: PhoneSession
  subagents: PhoneSession[]
  /** Worker states of `subagents`; null when it launched none that are listed. */
  subagentSummary: OrchestrationWorkerSummary | null
  /** Whether any member still runs, so a live subagent never sinks under an ended parent. */
  running: boolean
}

type WorkerLink = Pick<NativeChatOrchestrationWorker, 'paneKey' | 'parentPaneKey' | 'state'>

/**
 * Nests each worker under the top-most listed session above it. A worker whose parent is not
 * listed, or runs on another host, stays a session of its own.
 */
export function nestPhoneSessions(
  sessions: readonly PhoneSession[],
  workers: readonly WorkerLink[]
): PhoneSessionFamily[] {
  const byTabId = new Map(sessions.map((session) => [session.tabId, session]))
  const parentTabIdOf = new Map<string, string>()
  const workerStateOf = new Map<string, WorkerLink['state']>()
  for (const worker of workers) {
    const child = byTabId.get(parsePaneKey(worker.paneKey)?.tabId ?? '')
    const parent = byTabId.get(parsePaneKey(worker.parentPaneKey)?.tabId ?? '')
    if (child && parent && child !== parent && child.executionHostId === parent.executionHostId) {
      parentTabIdOf.set(child.tabId, parent.tabId)
      workerStateOf.set(child.tabId, worker.state)
    }
  }
  const rootTabIdOf = (tabId: string): string => {
    const seen = new Set([tabId])
    let current = tabId
    for (let parent = parentTabIdOf.get(current); parent; parent = parentTabIdOf.get(current)) {
      if (seen.has(parent)) {
        return tabId
      }
      seen.add(parent)
      current = parent
    }
    return current
  }

  const families = new Map<string, PhoneSessionFamily>()
  const nested: [rootTabId: string, session: PhoneSession][] = []
  for (const session of sessions) {
    const rootTabId = rootTabIdOf(session.tabId)
    if (rootTabId === session.tabId) {
      families.set(session.tabId, {
        session,
        subagents: [],
        subagentSummary: null,
        running: session.running
      })
    } else {
      nested.push([rootTabId, session])
    }
  }
  for (const [rootTabId, session] of nested) {
    const family = families.get(rootTabId)
    if (family) {
      family.subagents.push(session)
      family.running ||= session.running
    }
  }
  for (const family of families.values()) {
    if (family.subagents.length > 0) {
      family.subagentSummary = summarizeOrchestrationWorkers(
        family.subagents.flatMap((session) => {
          const state = workerStateOf.get(session.tabId)
          return state ? [{ state }] : []
        })
      )
    }
  }
  // Why the most urgent member: a subagent's question must not wait below calmer sessions.
  return [...families.values()]
    .map((family) => ({
      family,
      lead: [family.session, ...family.subagents].sort(comparePhoneSessions)[0]
    }))
    .sort((a, b) => comparePhoneSessions(a.lead, b.lead))
    .map(({ family }) => family)
}
