import { describe, expect, it } from 'vitest'
import {
  emptyResearchDocument,
  researchDocumentSchema
} from '../../../../shared/research/research-records'
import { researchConversationHome, writingAgentScopeKey } from './research-conversation-home'
import {
  figureAgentSessionId,
  figureChatSessions,
  figureOfChat,
  figureChatsDecided,
  withFigureAgentSession,
  withLegacyChatDecided,
  withRenamedFigureChat,
  withRestoredFigureChat
} from './research-figure-chat-slots'
import { withoutResearchConversation } from './research-conversation-delete'

const scope = { hostId: 'local', workspaceId: 'w1' }
const key = writingAgentScopeKey(scope)
const home = (records: ReturnType<typeof emptyResearchDocument>, sessionId: string) =>
  researchConversationHome(records, null, 'local', 'w1', sessionId).kind

describe('Figure chat slots', () => {
  it('keeps one chat per figure, separate from the project chat, and they survive a save', () => {
    let records = withFigureAgentSession(emptyResearchDocument(), scope, 'a', 'chat-a')
    records = withFigureAgentSession(records, scope, 'b', 'chat-b')
    records = withFigureAgentSession(records, scope, null, 'chat-none')
    expect(figureAgentSessionId(records, scope, 'a')).toBe('chat-a')
    expect(figureAgentSessionId(records, scope, 'b')).toBe('chat-b')
    expect(figureAgentSessionId(records, scope, null)).toBe('chat-none')
    expect(figureAgentSessionId(records, scope, 'c')).toBeUndefined()
    expect(figureChatSessions(records, scope)).toEqual(['chat-a', 'chat-b', 'chat-none'])
    const saved = researchDocumentSchema.parse(records)
    expect(saved.figureAgentSessionsByScope?.[key]).toEqual({ a: 'chat-a', b: 'chat-b' })
    expect(figureOfChat(saved, scope, 'chat-b')).toBe('b')
    expect(home(saved, 'chat-a')).toBe('figures')
  })

  it('loads a document from before per-figure chats', () => {
    const { figureAgentSessionsByScope: _new, ...older } = emptyResearchDocument()
    const parsed = researchDocumentSchema.parse({
      ...older,
      figuresAgentSessionByScope: { [key]: 'legacy' }
    })
    expect(figureAgentSessionId(parsed, scope, null)).toBe('legacy')
    expect(figureAgentSessionId(parsed, scope, 'a')).toBeUndefined()
    expect(home(parsed, 'legacy')).toBe('figures')
  })

  it('New chat replaces only that figure, and the old chat stays under Figures', () => {
    let records = withFigureAgentSession(emptyResearchDocument(), scope, 'a', 'chat-a')
    records = withFigureAgentSession(records, scope, 'b', 'chat-b')
    records = withFigureAgentSession(records, scope, 'a', 'chat-a2')
    expect(figureAgentSessionId(records, scope, 'a')).toBe('chat-a2')
    expect(figureAgentSessionId(records, scope, 'b')).toBe('chat-b')
    expect(records.figureAgentPastSessionsByScope?.[key]).toEqual(['chat-a'])
    expect(home(records, 'chat-a')).toBe('figures')
    expect(researchDocumentSchema.parse(records).figureAgentPastSessionsByScope?.[key]).toEqual([
      'chat-a'
    ])
  })

  it('moves a chat bound elsewhere instead of sharing it', () => {
    let records = withFigureAgentSession(emptyResearchDocument(), scope, 'a', 'chat-a')
    records = withFigureAgentSession(records, scope, 'b', 'chat-a')
    expect(figureAgentSessionId(records, scope, 'a')).toBeUndefined()
    expect(figureAgentSessionId(records, scope, 'b')).toBe('chat-a')
    expect(records.figureAgentPastSessionsByScope?.[key]).toEqual([])
  })

  it('keeps the chat when a figure is renamed and clears nothing else', () => {
    let records = withFigureAgentSession(emptyResearchDocument(), scope, 'a', 'chat-a')
    records = withFigureAgentSession(records, scope, 'b', 'chat-b')
    records = withRenamedFigureChat(records, scope, 'a', 'a-new')
    expect(figureAgentSessionId(records, scope, 'a')).toBeUndefined()
    expect(figureAgentSessionId(records, scope, 'a-new')).toBe('chat-a')
    expect(figureAgentSessionId(records, scope, 'b')).toBe('chat-b')
    expect(withRenamedFigureChat(records, scope, 'a-new', 'a-new')).toBe(records)
    expect(withRenamedFigureChat(records, scope, 'missing', 'x')).toBe(records)
  })

  it('unbinds a deleted figure, keeps its chat listed, and restores it on undo', () => {
    let records = withFigureAgentSession(emptyResearchDocument(), scope, 'a', 'chat-a')
    records = withFigureAgentSession(records, scope, 'a', null)
    expect(figureAgentSessionId(records, scope, 'a')).toBeUndefined()
    expect(records.figureAgentPastSessionsByScope?.[key]).toEqual(['chat-a'])
    expect(home(records, 'chat-a')).toBe('figures')
    const undone = withRestoredFigureChat(records, scope, 'a', 'chat-a')
    expect(figureAgentSessionId(undone, scope, 'a')).toBe('chat-a')
    expect(undone.figureAgentPastSessionsByScope?.[key]).toEqual([])
    const taken = withFigureAgentSession(records, scope, 'a', 'chat-new')
    expect(withRestoredFigureChat(taken, scope, 'a', 'chat-a')).toBe(taken)
  })

  it('moves the old single chat onto a figure once, without replacing a newer chat', () => {
    const legacy = {
      ...emptyResearchDocument(),
      figuresAgentSessionByScope: { [key]: 'legacy' }
    }
    expect(figureChatsDecided(legacy, scope)).toBe(false)
    const adopted = withLegacyChatDecided(legacy, scope, 'a')
    expect(figureAgentSessionId(adopted, scope, 'a')).toBe('legacy')
    expect(figureAgentSessionId(adopted, scope, null)).toBeUndefined()
    expect(figureChatsDecided(adopted, scope)).toBe(true)
    expect(withLegacyChatDecided(adopted, scope, 'b')).toBe(adopted)
    const undecided = withLegacyChatDecided(legacy, scope, null)
    expect(figureAgentSessionId(undecided, scope, null)).toBe('legacy')
    expect(figureChatsDecided(undecided, scope)).toBe(true)
  })

  it('never moves a later chat made for no open figure', () => {
    const later = withFigureAgentSession(emptyResearchDocument(), scope, null, 'none-chat')
    expect(figureChatsDecided(later, scope)).toBe(true)
    expect(withLegacyChatDecided(later, scope, 'a')).toBe(later)
  })

  it('drops a deleted conversation from its figure', () => {
    const records = withFigureAgentSession(emptyResearchDocument(), scope, 'a', 'chat-a')
    const removed = withoutResearchConversation(
      records,
      {
        id: 'agent-session:chat-a',
        entityId: 'chat-a',
        groupId: 'g',
        worktreeId: 'w1',
        contentType: 'agent-session',
        label: 'Figure agent',
        customLabel: null,
        color: null,
        sortOrder: 0,
        createdAt: 1
      },
      'local'
    )
    expect(figureAgentSessionId(removed, scope, 'a')).toBeUndefined()
    expect(home(removed, 'chat-a')).toBe('workbench')
  })
})
