import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { isOrcaSessionId, type OrcaSessionId } from '../../shared/orca-session-address'
import { makePaneKey } from '../../shared/stable-pane-id'
import {
  structuredAgentSessionPaneKey,
  structuredAgentSessionTabId
} from '../../shared/structured-agent-session-projection'
import { agentSessionRecordFixture } from '../native-chat/agent-session-record-test-fixture'
import { OrchestrationDb } from './orchestration/db'
import { RuntimeAgentOrchestrationProjection } from './runtime-agent-orchestration-projection'
import type { ChatLineageStore } from './runtime-chat-orchestration-lineage'
import type { RuntimeLeafRecord } from './runtime-terminal-state-records'
import {
  structuredWorkerIdentities,
  structuredWorkerProcessIncarnation
} from './structured-worker-identity'

function orcaSessionId(id: string): OrcaSessionId {
  if (!isOrcaSessionId(id)) {
    throw new Error(`not a session id: ${id}`)
  }
  return id
}

const CHAT = orcaSessionId('chat-session-root')
const CHAT_AFTER_CLEAR = orcaSessionId('chat-session-after-clear')
const WORKER = orcaSessionId('worker-session-0001')
const WORKER_HANDLE = 'structworker_worker'
const WORKER_MINTED_LEAF = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const WORKER_MINTED_PANE = makePaneKey(structuredAgentSessionTabId(WORKER), WORKER_MINTED_LEAF)
const TERMINAL_PANE = makePaneKey('tab-terminal', '11111111-1111-4111-8111-111111111111')
const RUN_TERMINAL_PANE = makePaneKey('tab-run-terminal', '22222222-2222-4222-8222-222222222222')
const NESTED_PANE = makePaneKey('tab-nested', '33333333-3333-4333-8333-333333333333')
const COORDINATED_PANE = makePaneKey('tab-coordinated', '44444444-4444-4444-8444-444444444444')
const ROOT = { maxDepth: Number.MAX_SAFE_INTEGER }

let db: OrchestrationDb

beforeEach(() => {
  db = new OrchestrationDb(':memory:')
})

afterEach(() => {
  structuredWorkerIdentities.clear()
  db.close()
})

function chatStore(
  records: AgentSessionRecord[],
  tabs: [sessionId: string, tabId: string][]
): ChatLineageStore {
  const byId = new Map(records.map((record) => [record.sessionId, record]))
  const tabBySession = new Map(tabs)
  return {
    getRecord: (sessionId) => byId.get(sessionId) ?? null,
    listRecords: () => [...byId.values()],
    listVisibleSessionIds: () => [...tabBySession.keys()],
    getSessionTabId: (sessionId) => tabBySession.get(sessionId) ?? null
  }
}

function projection(
  store: ChatLineageStore,
  terminals: Record<string, string>
): RuntimeAgentOrchestrationProjection {
  const entries = Object.entries(terminals).map(([handle, paneKey]) => ({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the projection reads only ptyId off a leaf; the deps below answer the rest.
    leaf: { ptyId: `pty-${handle}` } as RuntimeLeafRecord,
    handle,
    paneKey
  }))
  return new RuntimeAgentOrchestrationProjection({
    getDb: () => db,
    getLeaves: () => entries.map((entry) => entry.leaf),
    getPtys: () => [],
    issueLeafHandle: (leaf) => entries.find((entry) => entry.leaf === leaf)?.handle ?? '',
    issuePtyHandle: () => '',
    makePaneKey: (leaf) => entries.find((entry) => entry.leaf === leaf)?.paneKey ?? '',
    getWorktreeId: () => null,
    getHandleForPaneKey: () => null,
    getPaneKey: () => null,
    getDispatchAuthority: () => null,
    getAgentStatusSnapshot: () => [],
    getChatStore: () => store
  })
}

describe('chat orchestration lineage', () => {
  it('nests terminal workers under the chat that dispatched or coordinates them', () => {
    const run = db.createRun({
      objective: 'chat run',
      coordinatorHandle: null,
      coordinatorPaneKey: null,
      coordinatorOrcaSessionId: CHAT
    })
    const dispatched = db.createTask({ spec: 'dispatched by the chat', runId: run.id })
    db.createDispatchContext({
      ...ROOT,
      taskId: dispatched.id,
      assigneeHandle: 'term_worker',
      assigneePaneKey: TERMINAL_PANE,
      creator: { kind: 'session', orcaSessionId: CHAT }
    })
    const coordinated = db.createTask({ spec: 'in the chat run', runId: run.id })
    db.createDispatchContext({
      ...ROOT,
      taskId: coordinated.id,
      assigneeHandle: 'term_run_worker',
      assigneePaneKey: RUN_TERMINAL_PANE,
      creator: { kind: 'system' }
    })
    // The chat was `/clear`ed: its tab now shows the successor under the tab id it had.
    const store = chatStore(
      [
        agentSessionRecordFixture({
          sessionId: CHAT,
          conversationCommand: {
            command: 'clear',
            state: 'completed',
            replacementSessionId: CHAT_AFTER_CLEAR,
            operationId: 'op',
            callerKey: 'caller',
            phase: 'committed'
          }
        }),
        agentSessionRecordFixture({ sessionId: CHAT_AFTER_CLEAR })
      ],
      [[CHAT_AFTER_CLEAR, structuredAgentSessionTabId(CHAT)]]
    )

    const lineage = projection(store, {
      term_worker: TERMINAL_PANE,
      term_run_worker: RUN_TERMINAL_PANE
    }).buildByPaneKey()

    const chatParent = {
      parentPaneKey: structuredAgentSessionPaneKey(
        structuredAgentSessionTabId(CHAT),
        CHAT_AFTER_CLEAR
      ),
      parentAgentSessionId: CHAT_AFTER_CLEAR
    }
    expect(lineage?.[TERMINAL_PANE]).toMatchObject(chatParent)
    expect(lineage?.[RUN_TERMINAL_PANE]).toMatchObject(chatParent)
    expect(lineage?.[TERMINAL_PANE]).not.toHaveProperty('parentTerminalHandle')
    expect(lineage?.[TERMINAL_PANE]).not.toHaveProperty('agentSessionId')
  })

  it('keys a chat worker by its tab and never publishes its minted pane key', () => {
    structuredWorkerIdentities.register({
      handle: WORKER_HANDLE,
      sessionId: WORKER,
      agent: null,
      paneKey: WORKER_MINTED_PANE,
      processIncarnation: structuredWorkerProcessIncarnation(WORKER),
      worktreeId: 'workspace',
      hostScope: { kind: 'local', hostId: 'local' }
    })
    const run = db.createRun({
      objective: 'chat run',
      coordinatorHandle: null,
      coordinatorPaneKey: null,
      coordinatorOrcaSessionId: CHAT
    })
    const workerTask = db.createTask({ spec: 'chat worker', runId: run.id })
    db.createDispatchContext({
      ...ROOT,
      taskId: workerTask.id,
      assigneeHandle: WORKER_HANDLE,
      assigneePaneKey: WORKER_MINTED_PANE,
      processIncarnation: structuredWorkerProcessIncarnation(WORKER),
      creator: { kind: 'session', orcaSessionId: CHAT }
    })
    // The chat worker coordinates nested terminal workers: one it dispatched, one its Run holds.
    const nestedRun = db.createRun({
      objective: 'nested run',
      coordinatorHandle: WORKER_HANDLE,
      coordinatorPaneKey: WORKER_MINTED_PANE,
      coordinatorOrcaSessionId: WORKER
    })
    const nestedTask = db.createTask({
      spec: 'nested worker',
      runId: nestedRun.id,
      createdByTerminalHandle: WORKER_HANDLE,
      createdByPaneKey: WORKER_MINTED_PANE
    })
    db.createDispatchContext({
      ...ROOT,
      taskId: nestedTask.id,
      assigneeHandle: 'term_nested',
      assigneePaneKey: NESTED_PANE,
      creator: {
        kind: 'terminal',
        handle: WORKER_HANDLE,
        paneKey: WORKER_MINTED_PANE,
        orcaSessionId: WORKER
      }
    })
    const coordinatedTask = db.createTask({ spec: 'coordinated worker', runId: nestedRun.id })
    db.createDispatchContext({
      ...ROOT,
      taskId: coordinatedTask.id,
      assigneeHandle: 'term_coordinated',
      assigneePaneKey: COORDINATED_PANE,
      creator: { kind: 'system' }
    })
    const store = chatStore(
      [
        agentSessionRecordFixture({ sessionId: CHAT }),
        agentSessionRecordFixture({ sessionId: WORKER })
      ],
      [
        [CHAT, 'host-chat-tab'],
        [WORKER, 'host-worker-tab']
      ]
    )

    const lineage = projection(store, {
      term_nested: NESTED_PANE,
      term_coordinated: COORDINATED_PANE
    }).buildByPaneKey()

    const workerPane = structuredAgentSessionPaneKey('host-worker-tab', WORKER)
    expect(lineage?.[workerPane]).toMatchObject({
      agentSessionId: WORKER,
      parentPaneKey: structuredAgentSessionPaneKey('host-chat-tab', CHAT),
      parentAgentSessionId: CHAT
    })
    for (const nested of [NESTED_PANE, COORDINATED_PANE]) {
      expect(lineage?.[nested]).toMatchObject({
        parentPaneKey: workerPane,
        parentAgentSessionId: WORKER
      })
    }
    expect(JSON.stringify(lineage)).not.toContain(WORKER_MINTED_LEAF)
  })
})
