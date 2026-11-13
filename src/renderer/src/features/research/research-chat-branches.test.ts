import { describe, expect, it } from 'vitest'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import {
  researchChatBranchChildren,
  researchChatBranchFamily,
  researchChatBranchName,
  researchChatBranchOf,
  researchChatBranchRoot,
  withResearchChatBranch
} from './research-chat-branches'
import { researchConversationHome } from './research-conversation-home'

const SCOPE = { hostId: 'runtime:gpu', workspaceId: 'ws-1' }
const OTHER = { hostId: 'local', workspaceId: 'ws-1' }

function branch(parentSessionId: string, createdAt: string, messageNumber = 3) {
  return { parentSessionId, messageNumber, createdAt }
}

function family() {
  let document = emptyResearchDocument()
  document = withResearchChatBranch(document, SCOPE, 'b2', branch('root', '2026-11-13T01:00:00Z'))
  document = withResearchChatBranch(document, SCOPE, 'b3', branch('root', '2026-11-13T02:00:00Z'))
  document = withResearchChatBranch(document, SCOPE, 'b2a', branch('b2', '2026-11-13T03:00:00Z'))
  // Same ids on another host are another family.
  document = withResearchChatBranch(document, OTHER, 'x', branch('root', '2026-11-13T00:00:00Z'))
  return document
}

describe('research chat branches', () => {
  it('names where each branch came from, on its own host and workspace only', () => {
    const document = family()
    expect(researchChatBranchOf(document, SCOPE, 'b2a')).toMatchObject({ parentSessionId: 'b2' })
    expect(researchChatBranchOf(document, SCOPE, 'root')).toBeNull()
    expect(researchChatBranchChildren(document, SCOPE, 'root').map((c) => c.sessionId)).toEqual([
      'b2',
      'b3'
    ])
    expect(researchChatBranchChildren(document, OTHER, 'root').map((c) => c.sessionId)).toEqual([
      'x'
    ])
  })

  it('lists the whole family from its first chat, each branch after its parent', () => {
    const document = family()
    expect(researchChatBranchRoot(document, SCOPE, 'b2a')).toBe('root')
    expect(researchChatBranchFamily(document, SCOPE, 'b3')).toEqual(['root', 'b2', 'b2a', 'b3'])
    expect(researchChatBranchFamily(document, SCOPE, 'alone')).toEqual(['alone'])
  })

  it('survives a cycle a hand-edited document could hold', () => {
    let document = withResearchChatBranch(emptyResearchDocument(), SCOPE, 'a', branch('b', 't1'))
    document = withResearchChatBranch(document, SCOPE, 'b', branch('a', 't2'))
    expect(researchChatBranchRoot(document, SCOPE, 'a')).toBe('b')
    expect(researchChatBranchFamily(document, SCOPE, 'a').sort()).toEqual(['a', 'b'])
  })

  it('numbers a branch after its family, keeping the first chat’s name', () => {
    expect(researchChatBranchName('Figure agent · Fig 1', 1)).toBe(
      'Figure agent · Fig 1 · branch 2'
    )
    expect(researchChatBranchName('Figure agent · Fig 1 · branch 2', 2)).toBe(
      'Figure agent · Fig 1 · branch 3'
    )
    expect(researchChatBranchName('  ', 1)).toBe('Chat · branch 2')
  })

  it("keeps a figure's branches on Figures while the figure is bound to any of them", () => {
    const scopeKey = JSON.stringify([SCOPE.hostId, SCOPE.workspaceId])
    let document = withResearchChatBranch(
      emptyResearchDocument(),
      SCOPE,
      'branch',
      branch('figure-chat', 't1')
    )
    document = { ...document, figureAgentSessionsByScope: { [scopeKey]: { fig1: 'branch' } } }
    const home = (sessionId: string) =>
      researchConversationHome(document, null, SCOPE.hostId, SCOPE.workspaceId, sessionId).kind
    expect(home('branch')).toBe('figures')
    // The first chat is no longer bound, yet stays with its family on Figures.
    expect(home('figure-chat')).toBe('figures')
    expect(home('unrelated')).toBe('workbench')
  })
})
