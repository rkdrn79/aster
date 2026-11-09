import { describe, expect, it } from 'vitest'
import {
  emptyResearchDocument,
  researchDocumentSchema
} from '../../../../shared/research/research-records'
import {
  emptyResearchLibraryDocument,
  libraryScopeKey
} from '../../../../shared/research/research-library'
import {
  researchChatAvailableForHome,
  researchConversationHome,
  researchConversationHomeKey,
  researchConversationHomePage
} from './research-conversation-home'
import { withWritingAgentSession } from './research-writing-agent-session'
import { withRebuttalAgentSession } from './research-rebuttal-agent-session'
import { withFiguresAgentSession } from './research-figures-agent-session'

const experiment = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ablation',
  projectId: null,
  workspaceId: 'workspace-a',
  workspacePath: '/project-a',
  hostId: 'local',
  archived: false,
  writingAgentSessionId: 'current-writing',
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z'
}

describe('research conversation home', () => {
  it('offers older Writing chats in project Writing while isolating Experiment chats', () => {
    const projectWriting = { kind: 'writing' as const, experimentId: null }
    const olderWriting = { kind: 'writing' as const, experimentId: experiment.id }
    expect(researchChatAvailableForHome(olderWriting, projectWriting)).toBe(true)
    expect(researchChatAvailableForHome({ kind: 'workbench' }, projectWriting)).toBe(true)
    expect(
      researchChatAvailableForHome(
        { kind: 'experiment', experimentId: experiment.id },
        projectWriting
      )
    ).toBe(false)
    expect(
      researchChatAvailableForHome(
        { kind: 'experiment', experimentId: '22222222-2222-4222-8222-222222222222' },
        { kind: 'experiment', experimentId: experiment.id }
      )
    ).toBe(false)
  })

  it('places an Experiment workspace chat under its Experiment, saved or bound', () => {
    const records = {
      ...emptyResearchDocument(),
      experiments: [{ ...experiment, experimentAgentSessionId: 'docked-chat' }],
      conversationHomes: {
        [researchConversationHomeKey('local', 'workspace-a', 'older-docked')]: {
          kind: 'experiment' as const,
          experimentId: experiment.id
        }
      }
    }
    for (const sessionId of ['docked-chat', 'older-docked']) {
      expect(researchConversationHome(records, null, 'local', 'workspace-a', sessionId)).toEqual({
        kind: 'experiment',
        experimentId: experiment.id
      })
    }
    expect(researchDocumentSchema.safeParse(records).success).toBe(true)
  })

  it('keeps general and Experiment-linked chats in Workbench', () => {
    const records = {
      ...emptyResearchDocument(),
      experiments: [experiment],
      conversationExperimentIds: { 'general-tab': experiment.id }
    }
    expect(researchConversationHome(records, null, 'local', 'workspace-a', 'general')).toEqual({
      kind: 'workbench'
    })
  })

  it('recognizes dedicated bindings saved before conversation homes existed', () => {
    const records = { ...emptyResearchDocument(), experiments: [experiment] }
    const library = {
      ...emptyResearchLibraryDocument(),
      readingAgentSessionByScope: {
        [libraryScopeKey({ hostId: 'local', workspaceId: 'workspace-a' })]: 'current-reading'
      }
    }
    expect(
      researchConversationHome(records, library, 'local', 'workspace-a', 'current-writing')
    ).toEqual({ kind: 'writing', experimentId: null })
    expect(
      researchConversationHome(records, library, 'local', 'workspace-a', 'current-reading')
    ).toEqual({ kind: 'library' })
  })

  it('keeps older dedicated chats in their area after a newer chat is bound', () => {
    const records = {
      ...emptyResearchDocument(),
      experiments: [experiment],
      conversationHomes: {
        [researchConversationHomeKey('local', 'workspace-a', 'older-writing')]: {
          kind: 'writing' as const,
          experimentId: experiment.id
        },
        [researchConversationHomeKey('local', 'workspace-a', 'older-reading')]: {
          kind: 'library' as const
        }
      }
    }
    expect(researchDocumentSchema.parse(records).conversationHomes).toEqual(
      records.conversationHomes
    )
    expect(
      researchConversationHome(records, null, 'local', 'workspace-a', 'older-writing')
    ).toEqual({ kind: 'writing', experimentId: null })
    expect(
      researchConversationHome(
        { ...records, experiments: [] },
        null,
        'local',
        'workspace-a',
        'older-writing'
      )
    ).toEqual({ kind: 'writing', experimentId: null })
    expect(
      researchConversationHome(records, null, 'local', 'workspace-a', 'older-reading')
    ).toEqual({ kind: 'library' })
    expect(
      researchConversationHome(records, null, 'ssh:other', 'workspace-a', 'older-reading')
    ).toEqual({ kind: 'workbench' })
  })

  it('keeps a project-only Writing chat in Writing across host scopes and future Experiments', () => {
    const scope = { hostId: 'ssh:vip', workspaceId: 'workspace-a' }
    const first = withWritingAgentSession(emptyResearchDocument(), scope, 'writing-a')
    const records = withWritingAgentSession(first, scope, 'writing-b')
    expect(researchDocumentSchema.safeParse(records).success).toBe(true)
    for (const sessionId of ['writing-a', 'writing-b']) {
      expect(
        researchConversationHome(records, null, scope.hostId, scope.workspaceId, sessionId)
      ).toEqual({ kind: 'writing', experimentId: null })
      expect(
        researchConversationHome(records, null, 'local', scope.workspaceId, sessionId)
      ).toEqual({
        kind: 'workbench'
      })
    }
    const afterFirstExperiment = { ...records, experiments: [{ ...experiment, ...scope }] }
    expect(
      researchConversationHome(
        afterFirstExperiment,
        null,
        scope.hostId,
        scope.workspaceId,
        'writing-b'
      )
    ).toEqual({ kind: 'writing', experimentId: null })
  })

  it('keeps the Rebuttal chat on its page in a document older apps still read', () => {
    const scope = { hostId: 'local', workspaceId: 'workspace-a' }
    const saved = {
      ...emptyResearchDocument(),
      conversationHomes: {
        [researchConversationHomeKey('local', 'workspace-a', 'chat-1')]: {
          kind: 'library' as const
        }
      }
    }
    const records = withRebuttalAgentSession(saved, scope, 'chat-1')
    expect(researchConversationHome(records, null, 'local', 'workspace-a', 'chat-1')).toEqual({
      kind: 'rebuttal'
    })
    expect(
      researchChatAvailableForHome({ kind: 'rebuttal' }, { kind: 'writing', experimentId: null })
    ).toBe(false)
    expect(records.conversationHomes).toEqual({})
    const { rebuttalAgentSessionByScope: _added, ...older } = records
    expect(researchDocumentSchema.safeParse(older).success).toBe(true)
    expect(researchDocumentSchema.safeParse(records).success).toBe(true)
    const unbound = withRebuttalAgentSession(records, scope, null)
    expect(researchConversationHome(unbound, null, 'local', 'workspace-a', 'chat-1')).toEqual({
      kind: 'workbench'
    })
  })
  it('moves a chat to Figures when it is bound there, even from Rebuttal', () => {
    const scope = { hostId: 'local', workspaceId: 'workspace-a' }
    const rebuttal = withRebuttalAgentSession(emptyResearchDocument(), scope, 'chat-1')
    const records = withFiguresAgentSession(rebuttal, scope, 'chat-1')
    expect(researchConversationHome(records, null, 'local', 'workspace-a', 'chat-1')).toEqual({
      kind: 'figures'
    })
    expect(researchConversationHomePage({ kind: 'figures' })).toBe('research-figures')
    expect(records.rebuttalAgentSessionByScope).toEqual({})
    const { figuresAgentSessionByScope: _added, ...older } = records
    expect(researchDocumentSchema.safeParse(older).success).toBe(true)
    expect(researchDocumentSchema.safeParse(records).success).toBe(true)
  })
})
