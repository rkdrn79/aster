import { useEffect } from 'react'
import type { TopLevelView } from '../../../../shared/ui-chrome-types'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import type { ResearchHomeWorkspace } from './research-home-projects'
import { installResearchHistory, resumeResearchLocation } from './research-history-store'
import { restoreResearchSplitMainProject } from './research-split-persistence'
import { researchWindowSideId } from './research-window-surface'

export type ResearchPage =
  | 'research-writing'
  | 'research-figures'
  | 'research-rebuttal'
  | 'research-library'
  | 'research-experiments'
  | 'research-runs'
  | 'research-compare'
  | 'research-compute'
  | 'research-deadlines'

export function isResearchPage(view: TopLevelView): view is ResearchPage {
  return (
    view === 'research-writing' ||
    view === 'research-figures' ||
    view === 'research-rebuttal' ||
    view === 'research-library' ||
    view === 'research-experiments' ||
    view === 'research-runs' ||
    view === 'research-compare' ||
    view === 'research-compute' ||
    view === 'research-deadlines'
  )
}

export type ResearchHomePage = 'research-deadlines' | 'research-compute'

/** Planning and Compute span every project, so they live on the home screen. */
export function isResearchHomePage(view: TopLevelView): view is ResearchHomePage {
  return view === 'research-deadlines' || view === 'research-compute'
}

export function selectResearchInsideProject(
  state: Pick<AppState, 'activeWorktreeId' | 'activeView'>
): boolean {
  return state.activeWorktreeId !== null && !isResearchHomePage(state.activeView)
}

export function openResearchView(view: 'terminal' | ResearchPage): void {
  useAppStore.getState().setActiveView(view)
}

/** Leaves the open project; its terminals and chats keep running in the background. */
export function openResearchHome(view: 'terminal' | ResearchHomePage = 'terminal'): void {
  // Why: a project side always shows a project; Home belongs to the main column.
  if (researchWindowSideId()) {
    return
  }
  const state = useAppStore.getState()
  if (state.activeWorktreeId !== null) {
    state.setActiveWorktree(null)
  }
  state.setActiveView(view)
}

let startupHomeSettled = false

/** Aster opens on its project home; restored sessions keep running until the user enters one. */
export function useResearchHomeAtStartup(): void {
  const restored = useAppStore((state) => state.terminalStartupRestorationReady)
  const researchUiEnabled = useAppStore((state) => state.settings?.researchUiEnabled === true)
  useEffect(() => {
    installResearchHistory()
  }, [])
  useEffect(() => {
    if (!restored || startupHomeSettled) {
      return
    }
    startupHomeSettled = true
    if (researchUiEnabled) {
      openResearchHome()
      restoreResearchSplitMainProject(enterResearchWorkspace)
    }
  }, [restored, researchUiEnabled])
}

/** Opens a workspace where the Research layout last left it; callers may navigate right after. */
export function enterResearchWorkspace(
  workspace: Pick<ResearchHomeWorkspace, 'id' | 'executionHostId'>
): void {
  // Why: a side is pinned to its project; the main window reopens the side on the one picked.
  if (researchWindowSideId()) {
    void window.api.researchWindow.sideCommand({
      kind: 'replace',
      workspaceId: workspace.id,
      hostId: workspace.executionHostId ?? null
    })
    return
  }
  const opened = activateAndRevealWorkspace(workspace.id, {
    navigationIntent: 'user-open',
    ...(workspace.executionHostId ? { executionHostId: workspace.executionHostId } : {})
  })
  if (opened !== false) {
    resumeResearchLocation(workspace.id)
  }
}

const PROJECT_PAGES = [
  'terminal',
  'research-experiments',
  'research-writing',
  'research-figures',
  'research-rebuttal',
  'research-library'
] as const
const HOME_PAGES = ['terminal', 'research-deadlines', 'research-compute'] as const

/** ⌘1… in Research: the sidebar's top-level pages, in their sidebar order. */
export function openResearchPageByIndex(index: number): void {
  const state = useAppStore.getState()
  if (state.activeView === 'settings') {
    return
  }
  if (selectResearchInsideProject(state)) {
    const view = PROJECT_PAGES[index]
    if (view) {
      openResearchView(view)
    }
    return
  }
  const view = HOME_PAGES[index]
  if (view) {
    openResearchHome(view)
  }
}

export async function setResearchUiEnabled(enabled: boolean): Promise<void> {
  const state = useAppStore.getState()
  await state.updateSettingsOrThrow(
    enabled
      ? { researchUiEnabled: true, experimentalNativeChat: true }
      : { researchUiEnabled: false }
  )
  if (!enabled && isResearchPage(state.activeView)) {
    state.setActiveView('terminal')
  }
  const workspaceId = useAppStore.getState().activeWorktreeId
  if (enabled && workspaceId) {
    resumeResearchLocation(workspaceId)
  }
}
