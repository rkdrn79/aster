// A branch cuts where a rewind would, or after everything; a turn still running is left out, so a
// branch made mid-turn starts from the last finished message.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import {
  AGENT_JOURNAL_THREAD_SCOPE,
  type AgentJournalItemBody,
  type AgentSessionJournalIdentity
} from '../../../shared/agent-session-journal-types'
import { claudeProviderHandle } from '../../../shared/agent-session-provider-handle-encoding'
import { createTrackedJournalOpener } from '../agent-session-journal/journal-host-database-test-support'
import type { AgentSessionJournal } from '../agent-session-journal/journal-store'
import { structuredBranchCut } from './structured-branch-cut'

const IDENTITY: AgentSessionJournalIdentity = {
  sessionId: 'session-1',
  workspaceId: 'ws-1',
  hostId: 'host-1',
  agent: 'claude',
  providerHandle: claudeProviderHandle('claude-1', null)
}
const claude = (uuid: string) => ({ provider: 'claude' as const, sessionId: 'claude-1', uuid })
const key = (uuid: string) => agentJournalItemKey(claude(uuid))
const message = (role: 'user' | 'assistant', text: string): AgentJournalItemBody => ({
  kind: 'message',
  role,
  blocks: [{ type: 'text', text }]
})
const TARGET = { provider: 'claude', nativeId: 'claude-1' }

let root: string
const journals = createTrackedJournalOpener()

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aster-branch-cut-'))
})

afterEach(async () => {
  await journals.closeAll()
  await rm(root, { recursive: true, force: true })
})

async function turn(
  journal: AgentSessionJournal,
  id: string,
  state: 'running' | 'completed',
  opener?: string
) {
  const record = { provider: 'orca' as const, clientMessageId: id }
  await journal.appendItem(
    record,
    { kind: 'turn', turnId: id, state, ...(opener ? { userItemId: key(opener) } : {}) },
    { fence: 1, turnScope: AGENT_JOURNAL_THREAD_SCOPE }
  )
  const scope = { kind: 'turn' as const, turnItemId: agentJournalItemKey(record) }
  if (opener) {
    await journal.appendItem(claude(opener), message('user', opener), {
      fence: 1,
      turnScope: scope
    })
  }
  return scope
}

async function twoTurns(secondState: 'running' | 'completed'): Promise<AgentSessionJournal> {
  const journal = await journals.open({ identity: IDENTITY, stateDirectory: root })
  const first = await turn(journal, 'turn-1', 'completed', 'm1')
  await journal.appendItem(claude('a1'), message('assistant', 'a1'), { fence: 1, turnScope: first })
  const second = await turn(journal, 'turn-2', secondState, 'm2')
  await journal.appendItem(claude('a2'), message('assistant', 'a2'), {
    fence: 1,
    turnScope: second
  })
  return journal
}

describe('structuredBranchCut', () => {
  it('keeps everything for Branch chat while the agent is idle', async () => {
    expect(structuredBranchCut(await twoTurns('completed'), TARGET, null)).toEqual({
      cut: { kind: 'all' },
      keptMessages: 4
    })
  })

  it('branches mid-turn from the last finished message, before the running turn', async () => {
    const journal = await twoTurns('running')
    const throughFirstReply = {
      cut: { kind: 'through-entry', entry: { sessionId: 'claude-1', uuid: 'a1' } },
      keptMessages: 2
    }
    expect(structuredBranchCut(journal, TARGET, null)).toEqual(throughFirstReply)
    // A reply's own Branch from here names the running prompt as its cut: the same branch.
    expect(structuredBranchCut(journal, TARGET, key('m2'))).toEqual(throughFirstReply)
  })

  it('finds the running prompt by the turn it opened when the record names it another way', async () => {
    const journal = await journals.open({ identity: IDENTITY, stateDirectory: root })
    const first = await turn(journal, 'turn-1', 'completed', 'm1')
    await journal.appendItem(claude('a1'), message('assistant', 'a1'), {
      fence: 1,
      turnScope: first
    })
    // The running turn's record names its prompt by a key no row carries yet.
    const record = { provider: 'orca' as const, clientMessageId: 'turn-2' }
    await journal.appendItem(
      record,
      { kind: 'turn', turnId: 'turn-2', state: 'running', userItemId: 'orca:pending-send' },
      { fence: 1, turnScope: AGENT_JOURNAL_THREAD_SCOPE }
    )
    await journal.appendItem(claude('m2'), message('user', 'm2'), {
      fence: 1,
      turnScope: { kind: 'turn', turnItemId: agentJournalItemKey(record) }
    })
    expect(structuredBranchCut(journal, TARGET, null)).toEqual({
      cut: { kind: 'through-entry', entry: { sessionId: 'claude-1', uuid: 'a1' } },
      keptMessages: 2
    })
  })

  it('starts empty when the only turn is still running', async () => {
    const journal = await journals.open({ identity: IDENTITY, stateDirectory: root })
    await turn(journal, 'turn-1', 'running', 'm1')
    expect(structuredBranchCut(journal, TARGET, null)).toEqual({
      cut: { kind: 'none' },
      keptMessages: 0
    })
  })

  it('cuts before a turn-opening message, and nowhere else', async () => {
    const journal = await twoTurns('completed')
    expect(structuredBranchCut(journal, TARGET, key('m2'))).toEqual({
      cut: { kind: 'before-message', beforeMessage: { sessionId: 'claude-1', uuid: 'm2' } },
      keptMessages: 2
    })
    expect(structuredBranchCut(journal, TARGET, key('m1'))).toMatchObject({ keptMessages: 0 })
    expect(structuredBranchCut(journal, TARGET, key('a1'))).toBeNull()
    expect(structuredBranchCut(journal, { ...TARGET, nativeId: null }, key('m2'))).toBeNull()
  })

  it('is busy while a turn with no message of its own runs', async () => {
    const journal = await twoTurns('completed')
    await turn(journal, 'compaction', 'running')
    expect(structuredBranchCut(journal, TARGET, null)).toBe('busy')
  })
})
