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
  researchConversationHomeKey
} from './research-conversation-home'
import { withWritingAgentSession } from './research-writing-agent-session'

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
})
