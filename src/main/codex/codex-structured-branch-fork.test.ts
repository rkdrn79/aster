// A Codex branch is `thread/fork` on a short-lived app-server of the chat's own Codex home. These
// tests pin the exact call against the parameters Codex's app-server declares, since e2e never runs
// a real Codex.

import { describe, expect, it, vi } from 'vitest'
import { codexProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import { agentSessionRecordFixture } from '../native-chat/agent-session-record-test-fixture'
import type { CodexAppServerInvocation, CodexAppServerRpc } from './codex-app-server-session'
import { CodexAppServerUnsupportedError } from './codex-app-server-session'
import { createCodexBranchFork, forkCodexThread } from './codex-structured-branch-fork'

// `ThreadForkParams` keys as `codex app-server generate-ts` (codex-cli 0.156.1) declares them.
const THREAD_FORK_PARAM_KEYS = new Set([
  'threadId',
  'lastTurnId',
  'model',
  'modelProvider',
  'serviceTier',
  'cwd',
  'approvalPolicy',
  'approvalsReviewer',
  'sandbox',
  'config',
  'baseInstructions',
  'developerInstructions',
  'ephemeral',
  'threadSource',
  'excludeTurns'
])
// `ThreadTurnsListParams` keys from the same bindings.
const THREAD_TURNS_LIST_PARAM_KEYS = new Set([
  'threadId',
  'cursor',
  'limit',
  'sortDirection',
  'itemsView'
])

type Call = { method: string; params: Record<string, unknown> }

function fakeRpc(answers: { fork?: unknown; newestTurn?: string | null; forkError?: Error }): {
  rpc: CodexAppServerRpc
  calls: Call[]
} {
  const calls: Call[] = []
  return {
    calls,
    rpc: {
      notify: () => {},
      request: async (method, params = {}) => {
        calls.push({ method, params })
        if (method === 'thread/fork') {
          if (answers.forkError) {
            throw answers.forkError
          }
          return answers.fork ?? { thread: { id: 'fork-thread', turns: [] } }
        }
        if (method === 'thread/turns/list') {
          return { data: answers.newestTurn ? [{ id: answers.newestTurn }] : [], nextCursor: null }
        }
        throw new Error(`unexpected ${method}`)
      }
    }
  }
}

describe('forkCodexThread', () => {
  it('forks through the last kept turn and checks the copy ends there', async () => {
    const { rpc, calls } = fakeRpc({ newestTurn: 'turn-2' })
    expect(await forkCodexThread(rpc, 'source-thread', 'turn-2')).toEqual({
      ok: true,
      providerSessionId: 'fork-thread'
    })
    expect(calls).toEqual([
      {
        method: 'thread/fork',
        params: { threadId: 'source-thread', lastTurnId: 'turn-2', excludeTurns: true }
      },
      {
        method: 'thread/turns/list',
        params: { threadId: 'fork-thread', cursor: null, sortDirection: 'desc', limit: 1 }
      }
    ])
    for (const key of Object.keys(calls[0]!.params)) {
      expect(THREAD_FORK_PARAM_KEYS.has(key)).toBe(true)
    }
    for (const key of Object.keys(calls[1]!.params)) {
      expect(THREAD_TURNS_LIST_PARAM_KEYS.has(key)).toBe(true)
    }
  })

  it('copies every turn for Branch chat', async () => {
    const { rpc, calls } = fakeRpc({})
    expect(await forkCodexThread(rpc, 'source-thread', null)).toEqual({
      ok: true,
      providerSessionId: 'fork-thread'
    })
    expect(calls).toEqual([
      { method: 'thread/fork', params: { threadId: 'source-thread', excludeTurns: true } }
    ])
  })

  it('refuses a copy that kept more than asked, as a Codex without lastTurnId would make', async () => {
    const { rpc } = fakeRpc({ newestTurn: 'turn-3' })
    expect(await forkCodexThread(rpc, 'source-thread', 'turn-2')).toEqual({
      ok: false,
      reason: 'provider-refused'
    })
  })

  it('names a Codex without thread/fork unsupported, and any other failure a refusal', async () => {
    const missing = fakeRpc({ forkError: new CodexAppServerUnsupportedError('no fork') })
    expect(await forkCodexThread(missing.rpc, 't', null)).toEqual({
      ok: false,
      reason: 'unsupported'
    })
    const failed = fakeRpc({ forkError: new Error('rollout unreadable') })
    expect(await forkCodexThread(failed.rpc, 't', null)).toEqual({
      ok: false,
      reason: 'provider-refused'
    })
    const same = fakeRpc({ fork: { thread: { id: 't' } } })
    expect(await forkCodexThread(same.rpc, 't', null)).toEqual({
      ok: false,
      reason: 'provider-refused'
    })
  })
})

describe('createCodexBranchFork', () => {
  const record = agentSessionRecordFixture({
    sessionId: 'aster-chat',
    provider: 'codex',
    accountHome: { variable: 'CODEX_HOME', path: '/home/work/.codex' },
    providerHandleChain: [
      {
        linkId: 'created',
        handle: codexProviderHandle('source-thread'),
        origin: 'created',
        mintedAtFence: 1,
        observedAt: 0
      }
    ]
  })

  function fork(runSession = vi.fn()) {
    return {
      runSession,
      forkForBranch: createCodexBranchFork({
        resolveLaunchArgs: () => ['--profile', 'work'],
        resolveWorkspacePath: async () => '/work/project',
        resolveEnvironment: async () => ({ PATH: '/usr/bin', UNSET: undefined }),
        resolveCommand: () => '/usr/local/bin/codex',
        runSession
      })
    }
  }

  it("runs one app-server on the chat's Codex home and forks before the cut turn", async () => {
    const seen: { invocation?: CodexAppServerInvocation; calls: Call[] } = { calls: [] }
    const { forkForBranch } = fork(
      vi.fn(async (invocation: CodexAppServerInvocation, body) => {
        seen.invocation = invocation
        const { rpc, calls } = fakeRpc({ newestTurn: 'turn-1' })
        seen.calls = calls
        return body(rpc)
      })
    )
    expect(
      await forkForBranch({
        record,
        cut: { kind: 'before-turn', beforeTurnId: 'turn-2', keptTurnId: 'turn-1' }
      })
    ).toEqual({ ok: true, providerSessionId: 'fork-thread' })
    expect(seen.invocation).toMatchObject({
      command: '/usr/local/bin/codex',
      cwd: '/work/project',
      env: { PATH: '/usr/bin', CODEX_HOME: '/home/work/.codex' }
    })
    expect(seen.invocation?.args.at(-1)).toBe('app-server')
    expect(seen.calls[0]).toMatchObject({
      method: 'thread/fork',
      params: { threadId: 'source-thread', lastTurnId: 'turn-1' }
    })
  })

  it('starts nothing for a cut before the first turn, or one it cannot make', async () => {
    const { forkForBranch, runSession } = fork()
    expect(
      await forkForBranch({
        record,
        cut: { kind: 'before-turn', beforeTurnId: 'turn-1', keptTurnId: null }
      })
    ).toEqual({ ok: true, providerSessionId: null })
    expect(
      await forkForBranch({
        record,
        cut: { kind: 'before-message', beforeMessage: { sessionId: 's', uuid: 'u' } }
      })
    ).toEqual({ ok: false, reason: 'invalid-target' })
    expect(
      await forkForBranch({ record: { ...record, providerHandleChain: [] }, cut: { kind: 'all' } })
    ).toEqual({ ok: false, reason: 'not-saved' })
    expect(await forkForBranch({ record, cut: { kind: 'none' } })).toEqual({
      ok: true,
      providerSessionId: null
    })
    expect(
      await forkForBranch({
        record,
        cut: { kind: 'through-entry', entry: { sessionId: 's', uuid: 'u' } }
      })
    ).toEqual({ ok: false, reason: 'invalid-target' })
    expect(runSession).not.toHaveBeenCalled()
  })
})
