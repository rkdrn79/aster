import { describe, expect, it } from 'vitest'
import {
  emptyResearchDocument,
  researchDocumentSchema
} from '../../../../shared/research/research-records'
import {
  emptyResearchLibraryDocument,
  libraryScopeKey
} from '../../../../shared/research/research-library'
import { researchConversationHome, researchConversationHomeKey } from './research-conversation-home'

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
    ).toEqual({ kind: 'writing', experimentId: experiment.id })
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
    ).toEqual({ kind: 'writing', experimentId: experiment.id })
    expect(
      researchConversationHome(records, null, 'local', 'workspace-a', 'older-reading')
    ).toEqual({ kind: 'library' })
    expect(
      researchConversationHome(records, null, 'ssh:other', 'workspace-a', 'older-reading')
    ).toEqual({ kind: 'workbench' })
  })
})
