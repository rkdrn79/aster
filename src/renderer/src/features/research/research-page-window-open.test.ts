import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const context: { workspaceId: string | null; hostId: string } = {
    workspaceId: 'repo-1::/data/project',
    hostId: 'runtime:env-1'
  }
  return { context }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => false }))
vi.mock('./research-workspace-context', () => ({
  selectResearchWorkspaceContext: () => state.context
}))

import {
  RESEARCH_PAGE_DRAG_TYPE,
  openResearchPageInNewWindow,
  researchPageDragProps
} from './research-page-window-open'

const openWindow = vi.fn(async () => true)

function dragEvent(dropEffect: DataTransfer['dropEffect']) {
  const data = new Map<string, string>()
  return {
    dataTransfer: {
      dropEffect,
      effectAllowed: 'none',
      setData: (type: string, value: string) => data.set(type, value)
    },
    data
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { api: { researchWindow: { openWindow } } })
  state.context = { workspaceId: 'repo-1::/data/project', hostId: 'runtime:env-1' }
})
afterEach(() => {
  vi.unstubAllGlobals()
  openWindow.mockClear()
})

describe('research page windows from the sidebar', () => {
  it('opens the current workspace page in a new window', () => {
    openResearchPageInNewWindow('research-library')

    expect(openWindow).toHaveBeenCalledWith(
      { page: 'research-library', workspaceId: 'repo-1::/data/project', hostId: 'runtime:env-1' },
      {}
    )
  })

  it('opens nothing outside a workspace', () => {
    state.context = { workspaceId: null, hostId: 'runtime:env-1' }
    openResearchPageInNewWindow('research-writing')

    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens the page when a drag ends with nothing taking the drop', () => {
    const props = researchPageDragProps('research-experiments')
    const start = dragEvent('none')
    // @ts-expect-error -- a partial drag event: the handler reads only dataTransfer.
    props.onDragStart?.(start)
    expect(start.data.get(RESEARCH_PAGE_DRAG_TYPE)).toBe('research-experiments')

    // @ts-expect-error -- a partial drag event: the handler reads only dataTransfer.
    props.onDragEnd?.(dragEvent('move'))
    expect(openWindow).not.toHaveBeenCalled()

    // @ts-expect-error -- a partial drag event: the handler reads only dataTransfer.
    props.onDragEnd?.(dragEvent('none'))
    expect(openWindow).toHaveBeenCalledWith(
      expect.objectContaining({ page: 'research-experiments' }),
      { fromDrag: true }
    )
  })
})
