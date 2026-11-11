import { describe, expect, it, vi } from 'vitest'
import {
  markResearchWindowSurface,
  openChatInResearchWindow,
  setResearchWindowChatsSection,
  useResearchWindowChatRequest
} from './research-window-surface'

describe('openChatInResearchWindow', () => {
  it("does nothing in the main window, and shows this window's chats in its Chats section", () => {
    const showChats = vi.fn()
    expect(openChatInResearchWindow('wt-1', 'tab-1')).toBe(false)

    markResearchWindowSurface({
      page: 'research-experiments',
      workspaceId: 'wt-1',
      hostId: 'local'
    })
    setResearchWindowChatsSection(showChats)

    expect(openChatInResearchWindow('wt-2', 'tab-9')).toBe(false)
    expect(showChats).not.toHaveBeenCalled()

    const before = useResearchWindowChatRequest.getState().seq
    expect(openChatInResearchWindow('wt-1', 'tab-1')).toBe(true)
    expect(showChats).toHaveBeenCalledOnce()
    expect(useResearchWindowChatRequest.getState()).toEqual({ tabId: 'tab-1', seq: before + 1 })
  })
})
