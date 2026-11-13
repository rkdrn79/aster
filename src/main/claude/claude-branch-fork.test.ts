// A branch copies a Claude chat's conversation with the SDK's real `forkSession`, cut before a
// prompt or kept whole, and never changes the chat's own transcript.

import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import { agentSessionRecordFixture } from '../native-chat/agent-session-record-test-fixture'
import { forkClaudeConversationForBranch } from './claude-branch-fork'

let root: string
let home: string
let project: string
let source: string
let original: string
let ids = { firstPrompt: '', firstAnswer: '', secondPrompt: '', secondAnswer: '' }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aster-branch-fork-'))
  home = join(root, 'account')
  project = join(home, 'projects', 'workspace')
  await mkdir(project, { recursive: true })
  source = randomUUID()
  ids = {
    firstPrompt: randomUUID(),
    firstAnswer: randomUUID(),
    secondPrompt: randomUUID(),
    secondAnswer: randomUUID()
  }
  const entries = [
    { type: 'user', uuid: ids.firstPrompt, parentUuid: null, text: 'ALPHA?' },
    { type: 'assistant', uuid: ids.firstAnswer, parentUuid: ids.firstPrompt, text: 'ALPHA.' },
    { type: 'user', uuid: ids.secondPrompt, parentUuid: ids.firstAnswer, text: 'BRAVO?' },
    { type: 'assistant', uuid: ids.secondAnswer, parentUuid: ids.secondPrompt, text: 'BRAVO.' }
  ].map(({ type, uuid, parentUuid, text }) =>
    JSON.stringify({
      type,
      uuid,
      parentUuid,
      sessionId: source,
      timestamp: '2026-11-13T00:00:00.000Z',
      isSidechain: false,
      message:
        type === 'user'
          ? { role: 'user', content: text }
          : { role: 'assistant', content: [{ type: 'text', text }] }
    })
  )
  original = `${entries.join('\n')}\n`
  await writeFile(join(project, `${source}.jsonl`), original)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function record(rewind?: Parameters<typeof agentSessionRecordFixture>[0]['rewind']) {
  return agentSessionRecordFixture({
    sessionId: 'aster-chat',
    accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: home },
    providerHandleChain: [
      {
        linkId: 'created',
        handle: claudeProviderHandle(source, ids.secondAnswer),
        origin: 'created',
        mintedAtFence: 1,
        observedAt: 0
      }
    ],
    ...(rewind ? { rewind } : {})
  })
}

async function copyText(sessionId: string): Promise<string> {
  return readFile(join(project, `${sessionId}.jsonl`), 'utf8')
}

describe('Claude branch copies', () => {
  it('copies the whole conversation for Branch chat and leaves the source as it was', async () => {
    const result = await forkClaudeConversationForBranch({
      record: record(),
      cut: { kind: 'all' },
      claudeConfigDirs: [join(root, 'other-account'), home]
    })
    expect(result).toMatchObject({ ok: true })
    const copy = result.ok ? result.providerSessionId! : ''
    expect(copy).not.toBe(source)
    const contents = await copyText(copy)
    expect(contents).toContain('ALPHA.')
    expect(contents).toContain('BRAVO.')
    // Claude's fork remaps every entry, so the branch shares no id with the chat it came from.
    expect(contents).not.toContain(`"uuid":"${ids.secondPrompt}"`)
    expect(await readFile(join(project, `${source}.jsonl`), 'utf8')).toBe(original)
  })

  it('cuts before a prompt, keeping only the turns before it', async () => {
    const result = await forkClaudeConversationForBranch({
      record: record(),
      cut: { kind: 'before-message', beforeMessage: { sessionId: source, uuid: ids.secondPrompt } },
      claudeConfigDirs: [home]
    })
    const contents = await copyText(result.ok ? result.providerSessionId! : '')
    expect(contents).toContain('ALPHA.')
    expect(contents).not.toContain('BRAVO')
  })

  it('copies through the last entry the finished turns wrote, while a turn still runs', async () => {
    const result = await forkClaudeConversationForBranch({
      record: record(),
      cut: { kind: 'through-entry', entry: { sessionId: source, uuid: ids.firstAnswer } },
      claudeConfigDirs: [join(root, 'other-account'), home]
    })
    const contents = await copyText(result.ok ? result.providerSessionId! : '')
    expect(contents).toContain('ALPHA.')
    expect(contents).not.toContain('BRAVO')
    expect(
      await forkClaudeConversationForBranch({
        record: record(),
        cut: { kind: 'none' },
        claudeConfigDirs: [home]
      })
    ).toEqual({ ok: true, providerSessionId: null })
  })

  it('starts empty when the cut is before the first prompt', async () => {
    const result = await forkClaudeConversationForBranch({
      record: record(),
      cut: { kind: 'before-message', beforeMessage: { sessionId: source, uuid: ids.firstPrompt } },
      claudeConfigDirs: [home]
    })
    expect(result).toEqual({ ok: true, providerSessionId: null })
    expect(await readdir(project)).toEqual([`${source}.jsonl`])
  })

  it('refuses a prompt no Claude home holds, and a Codex-style cut', async () => {
    const unknownPrompt = { sessionId: source, uuid: randomUUID() }
    expect(
      await forkClaudeConversationForBranch({
        record: record(),
        cut: { kind: 'before-message', beforeMessage: unknownPrompt },
        claudeConfigDirs: [home]
      })
    ).toEqual({ ok: false, reason: 'invalid-target' })
    expect(
      await forkClaudeConversationForBranch({
        record: record(),
        cut: { kind: 'before-turn', beforeTurnId: 't', keptTurnId: null },
        claudeConfigDirs: [home]
      })
    ).toEqual({ ok: false, reason: 'invalid-target' })
  })

  it('says nothing is saved when the transcript is missing', async () => {
    await rm(join(project, `${source}.jsonl`))
    expect(
      await forkClaudeConversationForBranch({
        record: record(),
        cut: { kind: 'all' },
        claudeConfigDirs: [home]
      })
    ).toEqual({ ok: false, reason: 'not-saved' })
  })

  it('copies what a rewind kept, not the turns it undid, before the rewound chat runs again', async () => {
    const rewound = record({
      operationId: 'op',
      callerKey: 'caller',
      itemId: 'item',
      expectedEpoch: 'epoch',
      phase: 'completed',
      providerFork: {
        sessionId: randomUUID(),
        sourceSessionId: source,
        throughEntryId: ids.firstAnswer,
        replacesSessionId: source
      }
    })
    const result = await forkClaudeConversationForBranch({
      record: rewound,
      cut: { kind: 'all' },
      claudeConfigDirs: [home]
    })
    const contents = await copyText(result.ok ? result.providerSessionId! : '')
    expect(contents).toContain('ALPHA.')
    expect(contents).not.toContain('BRAVO')
  })
})
