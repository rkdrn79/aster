import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { TopLevelView } from '../../../shared/ui-chrome-types'
import { usePhoneHostResearch } from './phone-host-research-reads'
import { usePhoneNavigation, type PhoneScreen, type PhoneTab } from './phone-navigation-store'
import { usePhoneProjects } from './use-phone-projects'

/**
 * Research pages picked in the drawer open their phone view when one is fed by host RPC; the
 * desktop pages read desktop-only bridges and could only say so. Compute and Deadlines go to
 * Home only when the host answered something to show there.
 */
export function usePhoneResearchPageRedirect(activeView: TopLevelView): void {
  const { byWorkspaceId } = usePhoneProjects()
  useEffect(() => {
    const host = usePhoneHostResearch.getState()
    let tab: PhoneTab | null = null
    let screen: PhoneScreen | null = null
    if (activeView === 'research-runs') {
      tab = 'runs'
    } else if (activeView === 'research-library') {
      tab = 'files'
      usePhoneNavigation.getState().setFilesView('papers')
    } else if (activeView === 'research-experiments') {
      tab = 'home'
      const entry = byWorkspaceId.get(useAppStore.getState().activeWorktreeId ?? '')
      screen = entry
        ? { kind: 'project', projectKey: entry.project.key, title: entry.project.name }
        : null
    } else if (
      (activeView === 'research-compute' &&
        host.compute?.status === 'ready' &&
        host.compute.result.slurm.status !== 'absent') ||
      (activeView === 'research-deadlines' &&
        host.deadlines?.status === 'ready' &&
        host.deadlines.result.upcoming.length > 0)
    ) {
      tab = 'home'
    }
    if (!tab) {
      return
    }
    const target = tab
    const stack = screen ? [screen] : []
    usePhoneNavigation.setState((state) => ({
      tab: target,
      stacks: { ...state.stacks, [target]: stack }
    }))
    useAppStore.getState().setActiveView('terminal')
  }, [activeView, byWorkspaceId])
}
