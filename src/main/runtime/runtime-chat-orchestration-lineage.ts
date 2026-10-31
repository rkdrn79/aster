/**
 * Structured chats in the subagent lineage map. A chat has no terminal pane, so a client knows its
 * tab by the key `structuredAgentSessionPaneKey` derives from the tab and the session it shows. The
 * host publishes that key with the session id, so a client that gave the tab another id still
 * finds it. A structured worker's minted pane key reads its mailbox and never leaves the host.
 */

import type { AgentSessionRecordStore } from './agent-session-record-store'
import type { DispatchContextRow } from './orchestration/types'
import type { OrchestrationDb } from './orchestration/db'
import { canonicalOrcaSessionId } from './orchestration/canonical-orca-session-id'
import { resolveLineageRunningSession } from './orchestration/structured-session-lineage'
import { isOrcaSessionId, type OrcaSessionId } from '../../shared/orca-session-address'
import {
  structuredAgentSessionPaneKey,
  structuredAgentSessionTabId
} from '../../shared/structured-agent-session-projection'
import { parsePaneKey } from '../../shared/stable-pane-id'
import {
  structuredWorkerIdentities,
  structuredWorkerIdentityFromRow,
  structuredWorkerProcessIncarnation
} from './structured-worker-identity'

export type ChatLineageStore = Pick<
  AgentSessionRecordStore,
  'getRecord' | 'listRecords' | 'listVisibleSessionIds' | 'getSessionTabId'
>

export type LineagePane = { handle?: string; paneKey?: string; agentSessionId?: string }

type StructuredWorkerPanes = { handle: string; paneKey: string }

/** Per-session worker identity, or null for a chat; a worker is registered before its session exists. */
export type StructuredWorkerMemo = Map<string, StructuredWorkerPanes | null>

const CHAT_TAB_PREFIX = structuredAgentSessionTabId('')

/** The pane a chat's tab is known by: the session running `sessionId`'s conversation now. */
export function chatLineagePane(
  store: ChatLineageStore,
  sessionId: string
): { paneKey: string; agentSessionId: string } | null {
  const running = resolveLineageRunningSession(store, sessionId)
  if (running.kind === 'unverifiable') {
    return null
  }
  const tabId =
    store.getSessionTabId(running.sessionId) ?? structuredAgentSessionTabId(running.lineage[0])
  return {
    paneKey: structuredAgentSessionPaneKey(tabId, running.sessionId),
    agentSessionId: running.sessionId
  }
}

/** A terminal parent as is; a structured worker's minted pane becomes its chat's public one. */
function publicLineagePane(store: ChatLineageStore | null, pane: LineagePane): LineagePane {
  const tabId = pane.paneKey ? parsePaneKey(pane.paneKey)?.tabId : undefined
  if (!tabId?.startsWith(CHAT_TAB_PREFIX)) {
    return pane
  }
  return (store && chatLineagePane(store, tabId.slice(CHAT_TAB_PREFIX.length))) ?? {}
}

function chatParent(
  store: ChatLineageStore | null,
  sessionId: OrcaSessionId | null | undefined,
  ownSessionId: OrcaSessionId | null | undefined
): LineagePane | null {
  return store && sessionId && sessionId !== ownSessionId ? chatLineagePane(store, sessionId) : null
}

/**
 * The pane a worker nests under: the live terminal that created its task, else the chat or
 * structured worker that dispatched it, else its Run's coordinator, terminal or chat.
 */
export function resolveLineageParent(args: {
  store: ChatLineageStore | null
  creator: LineagePane | undefined
  coordinator: LineagePane
  coordinatorIsSelf: boolean
  dispatch: Partial<
    Pick<DispatchContextRow, 'creator_orca_session_id' | 'assignee_orca_session_id'>
  >
  runCoordinatorSessionId: OrcaSessionId | null
}): LineagePane {
  const { store, creator, coordinator, dispatch } = args
  if (creator?.handle) {
    return publicLineagePane(store, creator)
  }
  const own = dispatch.assignee_orca_session_id
  const dispatcher = chatParent(store, dispatch.creator_orca_session_id, own)
  if (dispatcher) {
    return dispatcher
  }
  if (args.coordinatorIsSelf) {
    return {}
  }
  if (coordinator.handle || coordinator.paneKey) {
    return publicLineagePane(store, coordinator)
  }
  return chatParent(store, args.runCoordinatorSessionId, own) ?? {}
}

function structuredWorkerFor(
  store: ChatLineageStore,
  db: OrchestrationDb,
  sessionId: string
): StructuredWorkerPanes | null {
  const known = structuredWorkerIdentities.getBySessionId(sessionId)
  if (known) {
    return known
  }
  // A `/clear` successor runs the worker minted under its lineage root.
  const root = isOrcaSessionId(sessionId) ? canonicalOrcaSessionId(sessionId, store) : sessionId
  const knownRoot = structuredWorkerIdentities.getBySessionId(root)
  if (knownRoot) {
    return knownRoot
  }
  const row = db.getWorkerTerminalResourceByProcessIncarnation?.(
    structuredWorkerProcessIncarnation(root)
  )
  return row ? structuredWorkerIdentityFromRow(row) : null
}

/** Structured workers whose chat tab this host shows, with the public pane each tab is known by. */
export function visibleStructuredWorkerChats(
  store: ChatLineageStore,
  db: OrchestrationDb,
  memo: StructuredWorkerMemo
): { worker: StructuredWorkerPanes; paneKey: string; agentSessionId: string }[] {
  const chats: { worker: StructuredWorkerPanes; paneKey: string; agentSessionId: string }[] = []
  for (const sessionId of store.listVisibleSessionIds()) {
    let worker = memo.get(sessionId)
    if (worker === undefined) {
      worker = structuredWorkerFor(store, db, sessionId)
      memo.set(sessionId, worker)
    }
    if (worker) {
      const tabId = store.getSessionTabId(sessionId) ?? structuredAgentSessionTabId(sessionId)
      chats.push({
        worker,
        paneKey: structuredAgentSessionPaneKey(tabId, sessionId),
        agentSessionId: sessionId
      })
    }
  }
  return chats
}
