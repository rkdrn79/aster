import { describe, expect, it, vi } from 'vitest'
import {
  emptyResearchDocument,
  type ResearchDocument
} from '../../../../shared/research/research-records'

vi.mock('@/lib/agent-message-send', () => ({ sendMessageToAgent: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ unifiedTabsByWorktree: {} }) } }))
vi.mock('./research-records-store', () => ({
  useResearchRecords: Object.assign(() => undefined, {
    getState: () => ({ document: null, update: vi.fn() })
  })
}))

import { researchConversationHome } from './research-conversation-home'
import {
  rebuttalReviewerSessionIds,
  rebuttalReviewerSessionKey,
  reviewerAgentSessionId,
  withReviewerAgentSession
} from './research-rebuttal-reviewer-session'

const scope = { hostId: 'local', workspaceId: 'ws' }
const other = { hostId: 'local', workspaceId: 'other' }

function document(): ResearchDocument {
  return emptyResearchDocument()
}

describe('per-reviewer agent sessions', () => {
  it('keeps one chat per rebuttal and reviewer', () => {
    let doc = withReviewerAgentSession(document(), scope, 'iclr', 'R1', 'chat-r1')
    doc = withReviewerAgentSession(doc, scope, 'iclr', 'R2', 'chat-r2')
    doc = withReviewerAgentSession(doc, scope, 'neurips', 'R1', 'chat-neurips-r1')
    expect(reviewerAgentSessionId(doc, scope, 'iclr', 'R1')).toBe('chat-r1')
    expect(reviewerAgentSessionId(doc, scope, 'iclr', 'R2')).toBe('chat-r2')
    expect(reviewerAgentSessionId(doc, scope, 'neurips', 'R1')).toBe('chat-neurips-r1')
    expect(reviewerAgentSessionId(doc, other, 'iclr', 'R1')).toBeUndefined()
    expect(rebuttalReviewerSessionIds(doc, scope).sort()).toEqual([
      'chat-neurips-r1',
      'chat-r1',
      'chat-r2'
    ])
    expect(rebuttalReviewerSessionKey(scope, 'iclr', 'R1')).toBe(
      JSON.stringify(['local', 'ws', 'iclr', 'R1'])
    )
  })

  it('unbinds a reviewer chat without touching the others', () => {
    let doc = withReviewerAgentSession(document(), scope, 'iclr', 'R1', 'chat-r1')
    doc = withReviewerAgentSession(doc, scope, 'iclr', 'R2', 'chat-r2')
    doc = withReviewerAgentSession(doc, scope, 'iclr', 'R1', null)
    expect(reviewerAgentSessionId(doc, scope, 'iclr', 'R1')).toBeUndefined()
    expect(reviewerAgentSessionId(doc, scope, 'iclr', 'R2')).toBe('chat-r2')
  })

  it('files a reviewer chat under the Rebuttal page, not the Workbench', () => {
    const doc = withReviewerAgentSession(document(), scope, 'iclr', 'R1', 'chat-r1')
    expect(researchConversationHome(doc, null, 'local', 'ws', 'chat-r1')).toEqual({
      kind: 'rebuttal'
    })
    expect(researchConversationHome(doc, null, 'local', 'other', 'chat-r1')).toEqual({
      kind: 'workbench'
    })
    expect(researchConversationHome(doc, null, 'local', 'ws', 'chat-r2').kind).toBe('workbench')
  })
})
