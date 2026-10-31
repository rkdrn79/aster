import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { Tab } from '../../../shared/tab-types'
import { launchPhoneAgent } from './phone-agent-launch'

const launchAgentInNewTab = vi.hoisted(() => vi.fn())
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab }))

const WORKTREE_ID = 'repo::/srv/repo'
const SESSION_ID = 'claude-session-2'

function chatTab(id: string, sessionId: string): Tab {
  return {
    id,
    entityId: sessionId,
    groupId: 'group-1',
    worktreeId: WORKTREE_ID,
    contentType: 'agent-session',
    agentSessionAgent: 'claude',
    label: 'Claude',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

afterEach(() => {
  useAppStore.setState({ unifiedTabsByWorktree: {} })
  launchAgentInNewTab.mockReset()
})

describe('launchPhoneAgent', () => {
  it('opens the chat it started, not the tab the workspace already shows', async () => {
    // An older chat is the workspace's open tab when the new one is admitted.
    useAppStore.setState({
      unifiedTabsByWorktree: { [WORKTREE_ID]: [chatTab('tab-old', 'claude-session-1')] }
    })
    launchAgentInNewTab.mockReturnValue({
      surface: { kind: 'host-published' },
      structuredSettlement: Promise.resolve({ kind: 'structured', sessionId: SESSION_ID })
    })

    const outcome = launchPhoneAgent({
      row: { kind: 'chat', agent: 'claude' },
      worktreeId: WORKTREE_ID,
      prompt: 'Look around'
    })
    // The host's tab reaches this client after the chat settled.
    await Promise.resolve()
    useAppStore.setState({
      unifiedTabsByWorktree: {
        [WORKTREE_ID]: [chatTab('tab-old', 'claude-session-1'), chatTab('tab-new', SESSION_ID)]
      }
    })

    await expect(outcome).resolves.toEqual({ status: 'started', tabId: 'tab-new' })
    expect(launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ requestedSurface: 'chat', agent: 'claude', prompt: 'Look around' })
    )
  })
})
