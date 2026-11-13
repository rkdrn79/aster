import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyResearchDocument,
  type ResearchDocument
} from '../../../../shared/research/research-records'
import { withResearchChatBranch } from './research-chat-branches'

const mocks = vi.hoisted(
  (): {
    supports: ReturnType<typeof vi.fn>
    prepare: ReturnType<typeof vi.fn>
    launch: ReturnType<typeof vi.fn>
    returnToComposer: ReturnType<typeof vi.fn>
    document: ResearchDocument | null
  } => ({
    supports: vi.fn(),
    prepare: vi.fn(),
    launch: vi.fn(),
    returnToComposer: vi.fn(),
    document: null
  })
)

vi.mock('@/runtime/structured-agent-session-branch-client', () => ({
  supportsStructuredAgentSessionBranch: mocks.supports,
  prepareStructuredAgentSessionBranch: mocks.prepare
}))
vi.mock('./research-chat-launch', () => ({ launchResearchChat: mocks.launch }))
vi.mock('@/components/native-chat/structured-agent-session-message-hand-back', () => ({
  returnMessageToComposer: mocks.returnToComposer
}))
vi.mock('./research-records-store', () => ({
  useResearchRecords: {
    getState: () => ({
      document: mocks.document,
      load: async () => {},
      update: async (change: (document: ResearchDocument) => ResearchDocument) => {
        mocks.document = change(mocks.document!)
      }
    })
  }
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ unifiedTabsByWorktree: {} }) } }))

const { branchResearchChat } = await import('./research-chat-branch-run')

const SOURCE = {
  hostId: 'runtime:gpu',
  workspaceId: 'ws-1',
  sessionId: 'chat-1',
  agent: 'claude' as const,
  label: 'Figure agent · Fig 1',
  target: { kind: 'environment' as const, environmentId: 'gpu' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.document = emptyResearchDocument()
  mocks.supports.mockResolvedValue(true)
  mocks.prepare.mockResolvedValue({ ok: true, providerSessionId: 'copy-1', keptMessages: 4 })
  mocks.launch.mockResolvedValue({ sessionId: 'branch-1' })
})

describe('branchResearchChat', () => {
  it("starts a chat that takes the host's copy over, named after the chat, and remembers it", async () => {
    expect(await branchResearchChat(SOURCE, { at: 'through', beforeItemId: 'm3' })).toEqual({
      sessionId: 'branch-1'
    })
    expect(mocks.prepare).toHaveBeenCalledWith(SOURCE.target, {
      sessionId: 'chat-1',
      beforeItemId: 'm3'
    })
    expect(mocks.launch).toHaveBeenCalledWith({
      hostId: 'runtime:gpu',
      workspaceId: 'ws-1',
      agent: 'claude',
      label: 'Figure agent · Fig 1 · branch 2',
      activate: false,
      resumeFrom: { providerSessionId: 'copy-1' }
    })
    expect(
      mocks.document?.chatBranches?.[JSON.stringify(['runtime:gpu', 'ws-1', 'branch-1'])]
    ).toMatchObject({ parentSessionId: 'chat-1', messageNumber: 4 })
  })

  it("numbers a branch at the person's message by that message, and puts it back to edit", async () => {
    const blocks = [
      { type: 'text' as const, text: 'Make it blue.\n\n```aster-context Figure\nscene\n```' }
    ]
    await branchResearchChat(SOURCE, {
      at: 'message',
      beforeItemId: 'm3',
      edit: { itemId: 'm3', blocks }
    })
    expect(mocks.returnToComposer).toHaveBeenCalledWith('agent-session:branch-1', 'branched-m3', [
      { type: 'text', text: 'Make it blue.' }
    ])
    expect(
      mocks.document?.chatBranches?.[JSON.stringify(['runtime:gpu', 'ws-1', 'branch-1'])]
    ).toMatchObject({ messageNumber: 5 })
  })

  it('asks a message again in the branch, and starts empty when the copy keeps nothing', async () => {
    mocks.prepare.mockResolvedValue({ ok: true, providerSessionId: null, keptMessages: 0 })
    await branchResearchChat(SOURCE, { at: 'message', beforeItemId: 'm1', resend: 'Draw it' })
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Draw it', label: 'Figure agent · Fig 1 · branch 2' })
    )
    expect(mocks.launch.mock.calls[0]![0]).not.toHaveProperty('resumeFrom')
  })

  it('numbers branches after the family the chat already has', async () => {
    mocks.document = withResearchChatBranch(mocks.document!, SOURCE, 'older', {
      parentSessionId: 'chat-1',
      messageNumber: 2,
      createdAt: '2026-11-13T00:00:00Z'
    })
    await branchResearchChat(SOURCE, { at: 'through', beforeItemId: null })
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Figure agent · Fig 1 · branch 3' })
    )
  })

  it('says why, and starts nothing, when the host is too old or refuses', async () => {
    mocks.supports.mockResolvedValueOnce(false)
    expect(await branchResearchChat(SOURCE, { at: 'through', beforeItemId: null })).toEqual({
      error: 'Update Aster on this server to branch its chats.'
    })
    mocks.prepare.mockResolvedValueOnce({ ok: false, reason: 'not-saved' })
    expect(await branchResearchChat(SOURCE, { at: 'through', beforeItemId: null })).toEqual({
      error: "Claude hasn't saved this chat yet. Try again after it replies."
    })
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.document?.chatBranches).toBeUndefined()
  })

  it('refuses an agent that cannot branch before asking its host', async () => {
    expect(
      await branchResearchChat(
        { ...SOURCE, agent: 'unknown' },
        { at: 'through', beforeItemId: null }
      )
    ).toEqual({ error: "Agent chats can't branch yet." })
    expect(mocks.supports).not.toHaveBeenCalled()
  })
})
