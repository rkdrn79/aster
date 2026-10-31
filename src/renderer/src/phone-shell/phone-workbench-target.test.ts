// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { Tab } from '../../../shared/tab-types'
import type { PhoneWorkbenchTarget } from './phone-navigation-store'
import { usePhoneWorkbenchReveal } from './phone-workbench-target'

const reveal = vi.hoisted(() => ({
  terminal: vi.fn(() => true),
  workspace: vi.fn(() => true),
  chat: vi.fn(() => true)
}))
vi.mock('@/lib/reveal-terminal-pane', () => ({ revealTerminalPane: reveal.terminal }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: reveal.workspace }))
vi.mock('@/lib/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: reveal.chat
}))

const WORKTREE_ID = 'repo::/srv/repo'
const TARGET: PhoneWorkbenchTarget = {
  kind: 'session',
  worktreeId: WORKTREE_ID,
  tabId: 'tab-new',
  leafId: null
}

function tab(id: string, contentType: Tab['contentType']): Tab {
  return {
    id,
    entityId: id,
    groupId: 'group-1',
    worktreeId: WORKTREE_ID,
    contentType,
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

afterEach(() => {
  cleanup()
  useAppStore.setState({ unifiedTabsByWorktree: {} })
  vi.clearAllMocks()
})

describe('usePhoneWorkbenchReveal', () => {
  it('shows a new session once it arrives instead of leaving the previous tab on screen', () => {
    useAppStore.setState({ unifiedTabsByWorktree: { [WORKTREE_ID]: [tab('tab-old', 'terminal')] } })
    renderHook(() => usePhoneWorkbenchReveal(TARGET))
    expect(reveal.terminal).toHaveBeenCalledTimes(1)

    act(() => {
      useAppStore.setState({
        unifiedTabsByWorktree: {
          [WORKTREE_ID]: [tab('tab-old', 'terminal'), tab('tab-new', 'agent-session')]
        }
      })
    })
    expect(reveal.chat).toHaveBeenCalledWith({ worktreeId: WORKTREE_ID, tabId: 'tab-new' })

    // A session that then leaves the host is not revealed again.
    act(() => {
      useAppStore.setState({
        unifiedTabsByWorktree: { [WORKTREE_ID]: [tab('tab-old', 'terminal')] }
      })
    })
    expect(reveal.terminal).toHaveBeenCalledTimes(1)
    expect(reveal.chat).toHaveBeenCalledTimes(1)
  })
})
