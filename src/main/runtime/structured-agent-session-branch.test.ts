import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionBranchCut } from '../../shared/agent-session-branch'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import { agentSessionRecordFixture } from '../native-chat/agent-session-record-test-fixture'
import type { StructuredBranchCutAnswer } from '../native-chat/agent-session-wire/structured-branch-cut'
import {
  prepareStructuredAgentSessionBranch,
  type StructuredAgentSessionBranchHost,
  type StructuredAgentSessionBranchRegistration
} from './structured-agent-session-branch'

const copy = vi.hoisted(() => vi.fn())
vi.mock('../ai-vault/structured-chat-conversation-copy', () => ({
  copyStructuredChatRecordConversation: copy
}))

const HEAD = {
  linkId: 'created',
  handle: claudeProviderHandle('provider-1', null),
  origin: 'created' as const,
  mintedAtFence: 1,
  observedAt: 0
}
const ALL: StructuredBranchCutAnswer = { cut: { kind: 'all' }, keptMessages: 4 }

function rig(input: {
  provider?: string
  chain?: AgentSessionRecord['providerHandleChain']
  answer?: StructuredBranchCutAnswer
  importer?: boolean
}) {
  const record = agentSessionRecordFixture({
    sessionId: 'chat-1',
    provider: input.provider ?? 'claude',
    providerHandleChain: input.chain ?? [HEAD]
  })
  const forkForBranch = vi.fn(async (_input: { cut: AgentSessionBranchCut }) => ({
    ok: true as const,
    providerSessionId: 'copy-1'
  }))
  const branchCut = vi.fn(async (): Promise<StructuredBranchCutAnswer> =>
    input.answer === undefined ? ALL : input.answer
  )
  const host: StructuredAgentSessionBranchHost = {
    branchCut,
    deps: {
      store: { getRecord: (id: string) => (id === 'chat-1' ? record : null) },
      adapter: { forkForBranch }
    }
  }
  const registration: StructuredAgentSessionBranchRegistration = {
    ...(input.importer === false ? {} : { transcriptImport: {} }),
    sessionHistory: { rowSessionId: () => 'row-1' }
  }
  const run = (beforeItemId: string | null, sessionId = 'chat-1') =>
    prepareStructuredAgentSessionBranch(host, { sessionId, beforeItemId }, () => registration)
  return { run, branchCut, forkForBranch }
}

beforeEach(() => copy.mockReset())

describe('prepareStructuredAgentSessionBranch', () => {
  it("hands the adapter the journal's cut and answers its copy with what it keeps", async () => {
    const cut: AgentSessionBranchCut = {
      kind: 'before-message',
      beforeMessage: { sessionId: 'provider-1', uuid: 'm2' }
    }
    const { run, forkForBranch, branchCut } = rig({ answer: { cut, keptMessages: 2 } })
    expect(await run('m2-key')).toEqual({
      ok: true,
      providerSessionId: 'copy-1',
      keptMessages: 2
    })
    expect(branchCut).toHaveBeenCalledWith(
      'chat-1',
      { provider: 'claude', nativeId: 'provider-1' },
      'm2-key'
    )
    expect(forkForBranch.mock.calls[0]![0].cut).toEqual(cut)
  })

  it('refuses an unknown chat, an agent that cannot branch, and one with no importer', async () => {
    expect(await rig({}).run(null, 'other')).toEqual({ ok: false, reason: 'invalid-target' })
    expect(await rig({ provider: 'gemini' }).run(null)).toEqual({
      ok: false,
      reason: 'unsupported'
    })
    expect(await rig({ importer: false }).run(null)).toEqual({
      ok: false,
      reason: 'unsupported'
    })
  })

  it('says why a cut cannot be made', async () => {
    for (const [answer, reason] of [
      ['busy', 'busy'],
      [null, 'invalid-target']
    ] as const) {
      const { run, forkForBranch } = rig({ answer })
      expect(await run(null)).toEqual({ ok: false, reason })
      expect(forkForBranch).not.toHaveBeenCalled()
    }
  })

  it('branches a chat with nothing saved into an empty chat', async () => {
    const { run, forkForBranch } = rig({
      chain: [],
      answer: { cut: { kind: 'all' }, keptMessages: 0 }
    })
    expect(await run(null)).toEqual({ ok: true, providerSessionId: null, keptMessages: 0 })
    expect(forkForBranch).not.toHaveBeenCalled()
  })

  it('branches empty, asking no agent, when only a running first turn would be cut', async () => {
    const { run, forkForBranch } = rig({ answer: { cut: { kind: 'none' }, keptMessages: 0 } })
    expect(await run(null)).toEqual({ ok: true, providerSessionId: null, keptMessages: 0 })
    expect(forkForBranch).not.toHaveBeenCalled()
  })

  it('copies an ACP chat whole through its own fork, and only from the latest message', async () => {
    copy.mockResolvedValue({ forkedSession: { sessionId: 'acp-copy', agent: 'opencode' } })
    expect(await rig({ provider: 'opencode' }).run(null)).toEqual({
      ok: true,
      providerSessionId: 'acp-copy',
      keptMessages: 4
    })
    expect(copy).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'chat-1' }), 'row-1')
    const earlier = rig({
      provider: 'opencode',
      answer: {
        cut: { kind: 'before-turn', beforeTurnId: 't2', keptTurnId: 't1' },
        keptMessages: 2
      }
    })
    expect(await earlier.run('m2')).toEqual({ ok: false, reason: 'latest-only' })
    // Branch chat mid-turn: the host cut before the running turn, which this agent cannot copy.
    expect(await earlier.run(null)).toEqual({ ok: false, reason: 'busy' })
  })
})
