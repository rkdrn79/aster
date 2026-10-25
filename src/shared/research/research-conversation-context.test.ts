import { describe, expect, it } from 'vitest'
import {
  conversationExperiment,
  selectConversationContext,
  setConversationExperiment
} from './research-conversation-context'
import { emptyResearchDocument, researchDocumentSchema } from './research-records'

const experimentId = '11111111-1111-4111-8111-111111111111'
const otherExperimentId = '22222222-2222-4222-8222-222222222222'
const now = '2026-10-24T00:00:00.000Z'
const base = {
  ...emptyResearchDocument(),
  experiments: [
    {
      id: experimentId,
      name: 'Ablation',
      projectId: null,
      workspaceId: 'workspace-a',
      workspacePath: '/project-a',
      hostId: 'local',
      archived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: otherExperimentId,
      name: 'Other workspace',
      projectId: null,
      workspaceId: 'workspace-b',
      workspacePath: '/project-b',
      hostId: 'local',
      archived: false,
      createdAt: now,
      updatedAt: now
    }
  ]
}

describe('conversation Experiment context', () => {
  it('links a chat only to an Experiment in the same workspace and host', () => {
    const linked = setConversationExperiment(base, 'chat-a', experimentId, 'workspace-a', 'local')
    expect(conversationExperiment(linked, 'chat-a', 'workspace-a', 'local')?.name).toBe('Ablation')
    expect(conversationExperiment(linked, 'chat-a', 'workspace-b', 'local')).toBeNull()
    expect(() =>
      setConversationExperiment(base, 'chat-a', otherExperimentId, 'workspace-a', 'local')
    ).toThrow('this workspace')
  })

  it('selects linked research context and clears stale context for an unlinked chat', () => {
    const linked = setConversationExperiment(base, 'chat-a', experimentId, 'workspace-a', 'local')
    const selected = selectConversationContext(linked, 'chat-a', 'workspace-a', 'local')
    expect(selected.selectedExperimentId).toBe(experimentId)
    expect(selected.selectedExperimentByWorkspace['["local","workspace-a"]']).toBe(experimentId)
    const unlinked = selectConversationContext(selected, 'chat-b', 'workspace-a', 'local')
    expect(unlinked.selectedExperimentId).toBeNull()
    expect(unlinked.selectedExperimentByWorkspace['["local","workspace-a"]']).toBeUndefined()
  })

  it('accepts old saved documents and rejects orphaned conversation links', () => {
    const { conversationExperimentIds: _links, ...olderDocument } = base
    const parsed = researchDocumentSchema.parse(olderDocument)
    expect(parsed.conversationExperimentIds).toEqual({})
    expect(() =>
      researchDocumentSchema.parse({
        ...base,
        conversationExperimentIds: { 'chat-a': '33333333-3333-4333-8333-333333333333' }
      })
    ).toThrow()
  })

  it('recognizes an existing Writing session until explicitly unlinked', () => {
    const writing = {
      ...base,
      experiments: base.experiments.map((experiment) =>
        experiment.id === experimentId
          ? { ...experiment, writingAgentSessionId: 'session-a' }
          : experiment
      )
    }
    expect(conversationExperiment(writing, 'chat-a', 'workspace-a', 'local', 'session-a')?.id).toBe(
      experimentId
    )
    const unlinked = setConversationExperiment(writing, 'chat-a', null, 'workspace-a', 'local')
    expect(
      conversationExperiment(unlinked, 'chat-a', 'workspace-a', 'local', 'session-a')
    ).toBeNull()
  })
})
