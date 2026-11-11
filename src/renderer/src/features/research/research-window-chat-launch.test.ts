import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  type Tab = { id: string; entityId: string }
  return {
    useAppStore: create<{ unifiedTabsByWorktree: Record<string, Tab[]> }>(() => ({
      unifiedTabsByWorktree: {}
    }))
  }
})

import { useAppStore } from '@/store'
import { launchResearchChatThroughMainWindow } from './research-window-chat-launch'

const windowTarget = { page: 'research-figures' as const, workspaceId: 'wt-1', hostId: 'local' }
const input = {
  hostId: 'local',
  workspaceId: 'wt-1',
  agent: 'claude' as const,
  prompt: 'Draw the pipeline',
  label: 'Figure agent · Pipeline'
}
const launchChat = vi.fn()

beforeEach(() => {
  useAppStore.setState({ unifiedTabsByWorktree: {} })
  launchChat.mockReset()
  vi.stubGlobal('window', { api: { researchWindow: { launchChat } } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('launchResearchChatThroughMainWindow', () => {
  it("asks the main window with the page's prompt and title, on this window's page", async () => {
    launchChat.mockResolvedValue({ error: 'no host' })

    await expect(launchResearchChatThroughMainWindow(windowTarget, input)).resolves.toEqual({
      error: 'no host'
    })
    expect(launchChat).toHaveBeenCalledWith(windowTarget, 'claude', {
      prompt: 'Draw the pipeline',
      label: 'Figure agent · Pipeline'
    })
  })

  it("answers once the new chat's tab has reached this window", async () => {
    launchChat.mockResolvedValue({ sessionId: 's-1' })
    let settled = false
    const pending = launchResearchChatThroughMainWindow(windowTarget, input).then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    useAppStore.setState({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the launch reads only a tab's entityId.
      unifiedTabsByWorktree: { 'wt-1': [{ id: 't-1', entityId: 's-1' }] } as never
    })

    await expect(pending).resolves.toEqual({ sessionId: 's-1' })
  })

  it('does not wait forever for a tab that never arrives', async () => {
    vi.useFakeTimers()
    launchChat.mockResolvedValue({ sessionId: 's-2' })

    const pending = launchResearchChatThroughMainWindow(windowTarget, input, 5_000)
    await vi.advanceTimersByTimeAsync(5_001)

    await expect(pending).resolves.toEqual({ sessionId: 's-2' })
  })
})
