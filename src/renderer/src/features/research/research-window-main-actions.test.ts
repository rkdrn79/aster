import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  closeUnifiedTab,
  setTabCustomTitle,
  openManuscriptInEditor,
  runResearchBackgroundAgent,
  surface
} = vi.hoisted(() => ({
  closeUnifiedTab: vi.fn(),
  setTabCustomTitle: vi.fn(),
  openManuscriptInEditor: vi.fn(),
  runResearchBackgroundAgent: vi.fn(),
  surface: vi.fn<() => unknown>(() => null)
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      unifiedTabsByWorktree: { 'wt-1': [{ id: 'tab-1', entityId: 's-1' }] },
      closeUnifiedTab,
      setTabCustomTitle
    })
  }
}))
vi.mock('./research-writing-open-editor', () => ({ openManuscriptInEditor }))
vi.mock('./research-background-agent-launch', () => ({ runResearchBackgroundAgent }))
vi.mock('./research-window-surface', () => ({ researchWindowSurfaceTarget: surface }))

import { runResearchWindowAction } from './research-window-main-actions'
import { closeResearchChatTab, renameResearchChatTab } from './research-window-tab-actions'

const runAction = vi.fn()
const tab = { id: 'tab-1', entityId: 's-1', worktreeId: 'wt-1' }

beforeEach(() => {
  vi.clearAllMocks()
  surface.mockReturnValue(null)
  closeUnifiedTab.mockReturnValue({ closedTabId: 'tab-1', wasLastTab: false, worktreeId: 'wt-1' })
  vi.stubGlobal('window', { api: { researchWindow: { runAction } } })
})

afterEach(() => vi.unstubAllGlobals())

describe('tab actions from a research window', () => {
  it('asks the main window to close or rename a chat, and changes nothing here', async () => {
    surface.mockReturnValue({ page: 'research-writing', workspaceId: 'wt-1', hostId: 'local' })
    runAction.mockResolvedValue({ ok: true })

    await expect(closeResearchChatTab(tab)).resolves.toBe(true)
    renameResearchChatTab(tab, 'Figure agent · Pipeline')

    expect(runAction).toHaveBeenCalledWith({
      kind: 'close-chat',
      workspaceId: 'wt-1',
      tabId: 'tab-1',
      entityId: 's-1'
    })
    expect(runAction).toHaveBeenCalledWith({
      kind: 'rename-chat',
      workspaceId: 'wt-1',
      tabId: 'tab-1',
      label: 'Figure agent · Pipeline'
    })
    expect(closeUnifiedTab).not.toHaveBeenCalled()
    expect(setTabCustomTitle).not.toHaveBeenCalled()
  })
})

describe('runResearchWindowAction in the main window', () => {
  it('closes the chat only when that tab still shows that session', async () => {
    await expect(
      runResearchWindowAction({
        kind: 'close-chat',
        workspaceId: 'wt-1',
        tabId: 'tab-1',
        entityId: 's-1'
      })
    ).resolves.toEqual({ ok: true })
    await expect(
      runResearchWindowAction({
        kind: 'close-chat',
        workspaceId: 'wt-1',
        tabId: 'tab-1',
        entityId: 's-2'
      })
    ).resolves.toMatchObject({ ok: false })
    expect(closeUnifiedTab).toHaveBeenCalledTimes(1)
  })

  it('renames, opens files and starts background agents here', async () => {
    runResearchBackgroundAgent.mockResolvedValue({ ok: true, delegationId: 'd-1' })
    openManuscriptInEditor.mockReturnValue(null)

    await runResearchWindowAction({
      kind: 'rename-chat',
      workspaceId: 'wt-1',
      tabId: 'tab-1',
      label: 'L'
    })
    const file = { absolutePath: '/p/paper/main.tex', relativePath: 'paper/main.tex' }
    await expect(
      runResearchWindowAction({
        kind: 'open-in-editor',
        workspaceId: 'wt-1',
        hostId: 'local',
        file
      })
    ).resolves.toEqual({ ok: true })

    expect(setTabCustomTitle).toHaveBeenCalledWith('tab-1', 'L', { recordInteraction: false })
    expect(openManuscriptInEditor).toHaveBeenCalledWith(
      { workspaceId: 'wt-1', hostId: 'local' },
      file,
      null
    )
  })
})
