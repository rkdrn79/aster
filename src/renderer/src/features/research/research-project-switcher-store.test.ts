// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

type MockState = {
  sidebarOpen: boolean
  activeWorktreeId: string | null
  activeWorkspaceExecutionHostId: null
  activeView: string
  setSidebarOpen: Mock<(open: boolean) => void>
}

const mocks = vi.hoisted(() => {
  const state: MockState = {
    sidebarOpen: true,
    activeWorktreeId: 'wa',
    activeWorkspaceExecutionHostId: null,
    activeView: 'research-figures',
    setSidebarOpen: vi.fn((open: boolean) => {
      state.sidebarOpen = open
    })
  }
  const projects = [
    { key: 'a', workspaces: [{ id: 'wa' }] },
    { key: 'b', workspaces: [{ id: 'wb', executionHostId: 'ssh:gpu' }] },
    { key: 'c', workspaces: [{ id: 'wc' }] }
  ]
  return { state, projects, enterResearchWorkspace: vi.fn() }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('./research-home-projects', () => ({
  buildResearchHomeProjects: () => mocks.projects,
  findResearchActiveProject: (projects: typeof mocks.projects, workspaceId: string | null) => ({
    project: projects.find((project) => project.workspaces[0].id === workspaceId) ?? null
  })
}))
vi.mock('./research-navigation', () => ({
  enterResearchWorkspace: mocks.enterResearchWorkspace,
  selectResearchInsideProject: (state: typeof mocks.state) =>
    state.activeWorktreeId !== null &&
    state.activeView !== 'research-deadlines' &&
    state.activeView !== 'research-compute'
}))

import {
  goToPreviousResearchProject,
  setResearchProjectSwitcherOpen,
  switchToResearchProject,
  takeResearchProjectSwitcherFocus,
  toggleResearchProjectSwitcher,
  useResearchProjectSwitcher
} from './research-project-switcher-store'

beforeEach(() => {
  setResearchProjectSwitcherOpen(false)
  takeResearchProjectSwitcherFocus()
  Object.assign(mocks.state, {
    sidebarOpen: true,
    activeWorktreeId: 'wa',
    activeView: 'research-figures'
  })
  mocks.state.setSidebarOpen.mockClear()
  mocks.enterResearchWorkspace.mockClear()
})

describe('goToPreviousResearchProject', () => {
  it('opens the most recent other project, where it was left', () => {
    expect(goToPreviousResearchProject()).toBe(true)
    expect(mocks.enterResearchWorkspace).toHaveBeenCalledWith({
      id: 'wb',
      executionHostId: 'ssh:gpu'
    })
  })

  it('opens the latest project from Home', () => {
    mocks.state.activeView = 'research-compute'
    goToPreviousResearchProject()
    expect(mocks.enterResearchWorkspace).toHaveBeenCalledWith({ id: 'wa' })
  })

  it('closes an open switcher on the way', () => {
    toggleResearchProjectSwitcher()
    goToPreviousResearchProject()
    expect(useResearchProjectSwitcher.getState().open).toBe(false)
  })
})

describe('switchToResearchProject', () => {
  it('leaves the open project on its page when it is picked again', () => {
    switchToResearchProject({ id: 'wa', executionHostId: undefined })
    expect(mocks.enterResearchWorkspace).not.toHaveBeenCalled()
  })

  it('hands focus to the new page instead of back to where the shortcut was pressed', () => {
    toggleResearchProjectSwitcher()
    switchToResearchProject({ id: 'wc', executionHostId: undefined })
    expect(mocks.enterResearchWorkspace).toHaveBeenCalledWith({
      id: 'wc',
      executionHostId: undefined
    })
    expect(takeResearchProjectSwitcherFocus()).toBe('page')
  })
})

describe('toggleResearchProjectSwitcher', () => {
  it('opens and closes the switcher', () => {
    toggleResearchProjectSwitcher()
    expect(useResearchProjectSwitcher.getState().open).toBe(true)
    toggleResearchProjectSwitcher()
    expect(useResearchProjectSwitcher.getState().open).toBe(false)
    expect(mocks.state.setSidebarOpen).not.toHaveBeenCalled()
  })

  it('shows a hidden sidebar only while the switcher is open', () => {
    mocks.state.sidebarOpen = false
    toggleResearchProjectSwitcher()
    expect(mocks.state.sidebarOpen).toBe(true)
    setResearchProjectSwitcherOpen(false)
    expect(mocks.state.sidebarOpen).toBe(false)
    // A later click-open does not hide the sidebar the user opened themselves.
    mocks.state.sidebarOpen = true
    setResearchProjectSwitcherOpen(true)
    setResearchProjectSwitcherOpen(false)
    expect(mocks.state.sidebarOpen).toBe(true)
  })

  it('after the shortcut, sends focus back where it was pressed when nothing changed', () => {
    const editor = document.createElement('textarea')
    document.body.append(editor)
    editor.focus()
    toggleResearchProjectSwitcher()
    setResearchProjectSwitcherOpen(false)
    expect(takeResearchProjectSwitcherFocus()).toBe(editor)
    editor.remove()
  })

  it('without a switch, sends focus back to the trigger after a click', () => {
    setResearchProjectSwitcherOpen(true)
    setResearchProjectSwitcherOpen(false)
    expect(takeResearchProjectSwitcherFocus()).toBe('trigger')
  })
})
