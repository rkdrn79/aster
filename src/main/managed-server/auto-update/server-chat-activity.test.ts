import { describe, expect, it, vi } from 'vitest'
import { agentSessionFailureFact } from '../../../shared/agent-session-failure'
import { agentSessionFailureWords } from '../../../shared/agent-session-failure-words'
import { agentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import type { AgentSessionStatusSummary } from '../../../shared/agent-session-wire'
import { orcaShutdownRowClientMessageId } from '../../../shared/native-chat-orca-stop-cut'
import {
  continueChatsCutByUpdate,
  readServerChatActivity,
  summarizeChatActivity,
  type ServerChatCaller
} from './server-chat-activity'

const NOW = 1_800_000_000_000

function session(
  sessionId: string,
  patch: Partial<AgentSessionStatusSummary>
): AgentSessionStatusSummary {
  const summary: AgentSessionStatusSummary = {
    sessionId,
    workspaceId: 'w',
    agent: 'claude',
    status: 'idle',
    latestPrompt: '',
    updatedAt: NOW - 10 * 60_000,
    ...patch
  }
  return summary
}

describe('which chats an update would cut', () => {
  it('counts replies in progress and live agents waiting on the user, not settled chats', () => {
    const activity = summarizeChatActivity(
      [
        session('working', { status: 'working', hostExecutionOwned: true }),
        session('asking', { status: 'attention', hostExecutionOwned: true }),
        session('starting', {
          status: 'idle',
          hostExecutionOwned: true,
          hostExecutionPhase: 'starting'
        }),
        session('done-unread', { status: 'attention' }),
        session('idle', { status: 'idle' }),
        session('just-moved', { status: 'idle', updatedAt: NOW - 5_000 })
      ],
      NOW
    )
    expect(activity.busy.map((chat) => chat.sessionId)).toEqual(['working', 'asking', 'starting'])
    expect(activity.recent).toEqual(['just-moved'])
  })

  it('reads an unreachable server as unknown, never as idle', async () => {
    const caller: ServerChatCaller = {
      statusSnapshot: async () => {
        throw new Error('connect ECONNREFUSED')
      },
      call: vi.fn()
    }
    expect(await readServerChatActivity(caller, NOW)).toBeNull()
  })
})

const turnItemId = agentJournalItemKey({
  provider: 'codex',
  threadId: 'thread-1',
  turnId: 'cut',
  ordinal: 1
})

function cutChatHistory(): unknown {
  const items: AgentJournalRenderItem[] = [
    {
      itemId: agentJournalItemKey({ provider: 'orca', clientMessageId: 'user-1' }),
      revision: 1,
      sequence: 1,
      observedAt: 1,
      body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'train it' }] }
    },
    {
      itemId: turnItemId,
      revision: 2,
      sequence: 2,
      observedAt: 2,
      body: { kind: 'turn', turnId: 'cut', state: 'interrupted', startedAt: 1, completedAt: 5 }
    },
    {
      itemId: agentJournalItemKey({
        provider: 'orca',
        clientMessageId: orcaShutdownRowClientMessageId('chat-cut', 3, 'gen-1')
      }),
      revision: 1,
      sequence: 3,
      observedAt: 6,
      body: {
        kind: 'status',
        ...agentSessionFailureWords(agentSessionFailureFact('providerExited'), {
          agentName: 'Codex',
          surface: 'row'
        }),
        tone: 'error',
        orcaStop: { cause: 'quit' }
      },
      turnScope: { kind: 'turn', turnItemId }
    }
  ]
  return { ok: true, page: { items, submissions: [] } }
}

describe('continuing the chats an update cut', () => {
  it('continues a cut chat on its cut turn and leaves an uncut one alone', async () => {
    const call = vi.fn(async (method: string, params: unknown) => {
      if (method === 'agentSession.history') {
        return Reflect.get(Object(params), 'sessionId') === 'chat-cut'
          ? cutChatHistory()
          : { ok: true, page: { items: [], submissions: [] } }
      }
      return { sessionId: 'chat-cut', outcome: 'continued' }
    })
    const continued = await continueChatsCutByUpdate({ statusSnapshot: async () => [], call }, [
      'chat-cut',
      'chat-idle',
      'chat-cut'
    ])
    expect(continued).toEqual(['chat-cut'])
    expect(call).toHaveBeenCalledWith('agentSession.continueInterrupted', {
      sessionId: 'chat-cut',
      turnItemId
    })
    expect(
      call.mock.calls.filter(([method]) => method === 'agentSession.continueInterrupted')
    ).toHaveLength(1)
  })

  it('does not count a continuation the host refused', async () => {
    const call = vi.fn(async (method: string) =>
      method === 'agentSession.history' ? cutChatHistory() : { outcome: 'refused' }
    )
    expect(
      await continueChatsCutByUpdate({ statusSnapshot: async () => [], call }, ['chat-cut'])
    ).toEqual([])
  })
})
