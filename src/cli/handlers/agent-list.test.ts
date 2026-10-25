import { describe, expect, it } from 'vitest'
import type { RuntimeMobileSessionTabsResult } from '../../shared/runtime-types'
import { openAgentChats } from './agent-list'

describe('openAgentChats', () => {
  it('lists only open structured chats with exact session and workspace identities', () => {
    const snapshot: RuntimeMobileSessionTabsResult = {
      worktree: 'project::/paper',
      publicationEpoch: 'epoch',
      snapshotVersion: 1,
      activeGroupId: null,
      activeTabId: null,
      activeTabType: null,
      tabs: [
        {
          type: 'agent-session',
          id: 'agent-session:writing',
          sessionId: 'writing',
          title: 'Writing agent',
          agent: 'claude',
          isActive: true
        },
        {
          type: 'agent-session',
          id: 'agent-session:experiment',
          sessionId: 'experiment',
          title: 'Ablation experiment',
          agent: 'codex',
          isActive: false
        },
        {
          type: 'file',
          id: 'file-1',
          title: 'notes.txt',
          filePath: '/paper/notes.txt',
          relativePath: 'notes.txt',
          language: 'plaintext',
          isDirty: false,
          isActive: false
        }
      ]
    }
    expect(openAgentChats([snapshot])).toEqual([
      {
        workspaceId: 'project::/paper',
        sessionId: 'writing',
        agent: 'claude',
        title: 'Writing agent',
        state: null
      },
      {
        workspaceId: 'project::/paper',
        sessionId: 'experiment',
        agent: 'codex',
        title: 'Ablation experiment',
        state: null
      }
    ])
  })
})
