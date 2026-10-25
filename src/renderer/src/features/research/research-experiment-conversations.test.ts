import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import { setConversationExperiment } from '../../../../shared/research/research-conversation-context'
import { groupExperimentConversations } from './research-experiment-conversations'

const experiment = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ablation',
  projectId: null,
  workspaceId: 'workspace-a',
  workspacePath: '/project-a',
  hostId: 'local',
  archived: false,
  writingAgentSessionId: 'writing-session',
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z'
}

function chat(id: string, entityId: string, workspaceId = 'workspace-a'): Tab {
  return {
    id,
    entityId,
    groupId: 'group-a',
    worktreeId: workspaceId,
    executionHostId: 'local',
    contentType: 'agent-session',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

describe('Experiment conversations', () => {
  it('shows explicit links from any agent alongside the existing Writing binding', () => {
    const base = { ...emptyResearchDocument(), experiments: [experiment] }
    const document = setConversationExperiment(
      base,
      'reading-tab',
      experiment.id,
      'workspace-a',
      'local'
    )
    const grouped = groupExperimentConversations(
      document,
      [chat('writing-tab', 'writing-session'), chat('reading-tab', 'reading-session')],
      'workspace-a',
      'local'
    )
    expect(grouped.get(experiment.id)?.map((tab) => tab.id)).toEqual(['writing-tab', 'reading-tab'])
  })

  it('does not show chats from another workspace or unrelated terminal tabs', () => {
    const document = { ...emptyResearchDocument(), experiments: [experiment] }
    const grouped = groupExperimentConversations(
      document,
      [
        chat('other-workspace', 'writing-session', 'workspace-b'),
        { ...chat('plain-terminal', 'writing-session'), contentType: 'terminal' }
      ],
      'workspace-a',
      'local'
    )
    expect(grouped.get(experiment.id)).toBeUndefined()
  })

  it('lists the docked Experiment chat first, unless the user unlinked it', () => {
    const docked = { ...experiment, experimentAgentSessionId: 'docked-session' }
    const document = setConversationExperiment(
      { ...emptyResearchDocument(), experiments: [docked] },
      'reading-tab',
      docked.id,
      'workspace-a',
      'local'
    )
    const tabs = [chat('reading-tab', 'reading-session'), chat('docked-tab', 'docked-session')]
    expect(
      groupExperimentConversations(document, tabs, 'workspace-a', 'local')
        .get(docked.id)
        ?.map((tab) => tab.id)
    ).toEqual(['docked-tab', 'reading-tab'])
    const unlinked = setConversationExperiment(document, 'docked-tab', null, 'workspace-a', 'local')
    expect(
      groupExperimentConversations(unlinked, tabs, 'workspace-a', 'local')
        .get(docked.id)
        ?.map((tab) => tab.id)
    ).toEqual(['reading-tab'])
  })
})
