import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import {
  emptyResearchLibraryDocument,
  libraryScopeKey
} from '../../../../shared/research/research-library'
import { researchConversationHomeKey, writingAgentScopeKey } from './research-conversation-home'
import {
  withoutReadingConversation,
  withoutResearchConversation
} from './research-conversation-delete'

const tab: Tab = {
  id: 'agent-session:reading',
  entityId: 'reading',
  groupId: 'group',
  worktreeId: 'workspace',
  contentType: 'agent-session',
  label: 'Reading agent',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 1
}

describe('research conversation removal', () => {
  it('clears only the deleted session links on its own host and workspace', () => {
    const document = emptyResearchDocument()
    const ownKey = researchConversationHomeKey('local', 'workspace', 'reading')
    const otherKey = researchConversationHomeKey('other-host', 'workspace', 'reading')
    document.conversationHomes = {
      [ownKey]: { kind: 'library' },
      [otherKey]: { kind: 'library' }
    }
    document.conversationExperimentIds = {
      [tab.id]: null,
      'agent-session:other': null
    }
    const removed = withoutResearchConversation(document, tab, 'local')
    expect(removed.conversationHomes).toEqual({ [otherKey]: { kind: 'library' } })
    expect(removed.conversationExperimentIds).toEqual({ 'agent-session:other': null })
  })

  it('unbinds a reading agent without touching the same ID on another host', () => {
    const document = emptyResearchLibraryDocument()
    const ownKey = libraryScopeKey({ hostId: 'local', workspaceId: 'workspace' })
    const otherKey = libraryScopeKey({ hostId: 'other-host', workspaceId: 'workspace' })
    document.readingAgentSessionByScope = { [ownKey]: 'reading', [otherKey]: 'reading' }
    expect(withoutReadingConversation(document, tab, 'local').readingAgentSessionByScope).toEqual({
      [otherKey]: 'reading'
    })
  })

  it('unbinds the matching Writing experiment without removing other experiments', () => {
    const document = emptyResearchDocument()
    const base = {
      id: '46d8c1ce-e93e-4e0f-aada-ff5aa9c7d4fd',
      name: 'Baseline',
      projectId: null,
      workspaceId: 'workspace',
      workspacePath: '/project',
      hostId: 'local',
      writingAgentSessionId: 'reading',
      archived: false,
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z'
    }
    document.experiments = [
      base,
      { ...base, id: 'e568d48b-90bc-4b2a-94ee-df913c85872d', hostId: 'other-host' }
    ]
    const removed = withoutResearchConversation(document, tab, 'local')
    expect(removed.experiments[0]?.writingAgentSessionId).toBeUndefined()
    expect(removed.experiments[1]?.writingAgentSessionId).toBe('reading')
  })

  it('unbinds a project Writing chat without removing another host’s binding', () => {
    const document = emptyResearchDocument()
    const ownKey = writingAgentScopeKey({ hostId: 'local', workspaceId: 'workspace' })
    const otherKey = writingAgentScopeKey({ hostId: 'other-host', workspaceId: 'workspace' })
    document.writingAgentSessionByScope = { [ownKey]: 'reading', [otherKey]: 'reading' }
    expect(withoutResearchConversation(document, tab, 'local').writingAgentSessionByScope).toEqual({
      [otherKey]: 'reading'
    })
  })
})
