import { useAppStore } from '@/store'
import { selectPhoneScreen, usePhoneNavigation, type PhoneTab } from './phone-navigation-store'
import type { PhoneRunSummary } from './phone-run-summaries'
import type { PhoneSession } from './phone-sessions'
import { openPhoneRun } from './PhoneRunsScreen'
import { openPhoneSession } from './phone-workbench-target'

/** The tab and top screen the user sees, or null while a full page (Settings…) covers them. */
function visiblePhoneScreen(): {
  tab: PhoneTab
  screen: ReturnType<typeof selectPhoneScreen>
} | null {
  if (useAppStore.getState().activeView !== 'terminal') {
    return null
  }
  const navigation = usePhoneNavigation.getState()
  return { tab: navigation.tab, screen: selectPhoneScreen(navigation) }
}

/** Home and Agents list a waiting session at their root, so the user already sees it there. */
export function isPhoneSessionOnScreen(
  session: Pick<PhoneSession, 'worktreeId' | 'tabId'>
): boolean {
  const visible = visiblePhoneScreen()
  if (!visible) {
    return false
  }
  if (!visible.screen) {
    return visible.tab === 'home' || visible.tab === 'agents'
  }
  const { screen } = visible
  return (
    screen.kind === 'workbench' &&
    screen.target.kind === 'session' &&
    screen.target.worktreeId === session.worktreeId &&
    screen.target.tabId === session.tabId
  )
}

export function isPhoneRunOnScreen(summary: PhoneRunSummary): boolean {
  const visible = visiblePhoneScreen()
  if (!visible) {
    return false
  }
  if (!visible.screen) {
    return visible.tab === 'runs'
  }
  const { screen } = visible
  return (
    screen.kind === 'run' &&
    screen.worktreeId === summary.worktreeId &&
    screen.experiment === summary.experimentSlug &&
    screen.run === summary.run.id
  )
}

/** Leaves any full page and switches tab without resetting it, so the next push lands there. */
export function showPhoneTab(tab: PhoneTab): void {
  const app = useAppStore.getState()
  if (app.activeView !== 'terminal') {
    app.setActiveView('terminal')
  }
  usePhoneNavigation.setState({ tab })
}

export function openPhoneSessionFromNotice(session: PhoneSession, workspaceLabel: string): void {
  if (isPhoneSessionOnScreen(session) && visiblePhoneScreen()?.screen) {
    return
  }
  showPhoneTab('agents')
  openPhoneSession(session, workspaceLabel)
}

export function openPhoneRunFromNotice(summary: PhoneRunSummary): void {
  if (isPhoneRunOnScreen(summary) && visiblePhoneScreen()?.screen) {
    return
  }
  showPhoneTab('runs')
  openPhoneRun(summary)
}
