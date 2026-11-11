import { create } from 'zustand'
import { useAppStore } from '@/store'
import { buildResearchHomeProjects, findResearchActiveProject } from './research-home-projects'
import { enterResearchWorkspace, selectResearchInsideProject } from './research-navigation'
import { previousResearchProject } from './research-project-switcher'

/** Whether the project switcher is open; the sidebar that hosts it reads this. */
export const useResearchProjectSwitcher = create<{ open: boolean }>(() => ({ open: false }))

// Why: the shortcut shows a hidden sidebar only for as long as the switcher needs it.
let sidebarShownForSwitcher = false
// Where the shortcut was pressed, so closing without a switch puts the user back there.
let returnFocus: HTMLElement | null = null
let navigated = false

/**
 * Where focus goes as the switcher closes: back where the shortcut was pressed, nowhere after a
 * move to another page (that page takes over), else the name it was opened from.
 */
export function takeResearchProjectSwitcherFocus(): HTMLElement | 'page' | 'trigger' {
  const element = returnFocus
  const moved = navigated
  returnFocus = null
  navigated = false
  if (moved) {
    return 'page'
  }
  return element?.isConnected ? element : 'trigger'
}

export function setResearchProjectSwitcherOpen(open: boolean): void {
  if (useResearchProjectSwitcher.getState().open === open) {
    return
  }
  useResearchProjectSwitcher.setState({ open })
  if (!open && sidebarShownForSwitcher) {
    sidebarShownForSwitcher = false
    useAppStore.getState().setSidebarOpen(false)
  }
}

/** The shortcut: opens the switcher where it lives, in the sidebar, or closes it again. */
export function toggleResearchProjectSwitcher(): void {
  if (useResearchProjectSwitcher.getState().open) {
    setResearchProjectSwitcherOpen(false)
    return
  }
  const state = useAppStore.getState()
  const focused = document.activeElement
  returnFocus = focused instanceof HTMLElement && focused !== document.body ? focused : null
  navigated = false
  if (!state.sidebarOpen) {
    sidebarShownForSwitcher = true
    state.setSidebarOpen(true)
  }
  setResearchProjectSwitcherOpen(true)
}

/** Closes the switcher for a move elsewhere (a project, Home), so focus stays with the new page. */
export function closeResearchProjectSwitcherForNavigation(): void {
  navigated = true
  setResearchProjectSwitcherOpen(false)
}

/**
 * Opens a project where it was left: the Research layout restores its last page, Experiment, and
 * the figure or rebuttal that page last showed. Activation is synchronous, so a project on a
 * disconnected host opens at once and its pages report the connection themselves.
 */
export function switchToResearchProject(
  workspace: Parameters<typeof enterResearchWorkspace>[0]
): void {
  closeResearchProjectSwitcherForNavigation()
  const state = useAppStore.getState()
  // Why: picking the open project keeps the page it is on.
  if (selectResearchInsideProject(state) && state.activeWorktreeId === workspace.id) {
    return
  }
  enterResearchWorkspace(workspace)
}

/** Back and forth between the two most recent projects; from Home, into the latest one. */
export function goToPreviousResearchProject(): boolean {
  const state = useAppStore.getState()
  const projects = buildResearchHomeProjects(state)
  const { project } = selectResearchInsideProject(state)
    ? findResearchActiveProject(
        projects,
        state.activeWorktreeId,
        state.activeWorkspaceExecutionHostId
      )
    : { project: null }
  const previous = previousResearchProject(projects, project?.key ?? null)
  if (!previous) {
    return false
  }
  switchToResearchProject(previous.workspaces[0])
  return true
}
