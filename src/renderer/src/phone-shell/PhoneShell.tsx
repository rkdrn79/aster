import { Suspense, useRef } from 'react'
import { FolderPlus, Plus, RefreshCw } from 'lucide-react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useAppStore } from '@/store'
import { RecoverableRenderErrorBoundary } from '@/components/error-boundaries/RecoverableRenderErrorBoundary'
import { TerminalWorkbenchContainer } from '@/components/TerminalWorkbenchContainer'
import type { VirtualizedScrollAnchor } from '@/hooks/useVirtualizedScrollAnchor'
import { ActivePage, WorktreeSidebar } from '@/app-shell/AppWorkspaceShell'
import { CompactSidebarDrawer } from '@/app-shell/CompactSidebarDrawer'
import { useCompactDrawer } from '@/app-shell/compact-drawer-store'
import { TitlebarLeftControls } from '@/app-shell/TitlebarLeftControls'
import type { AppChromeLayout } from '@/app-shell/use-app-chrome-layout'
import { useCompactSidebarDrawer } from '@/app-shell/use-compact-sidebar-drawer'
import type { TopLevelView } from '../../../shared/ui-chrome-types'
import {
  selectPhoneScreen,
  usePhoneNavigation,
  type PhoneScreen,
  type PhoneTab
} from './phone-navigation-store'
import { phoneSessionNeedsYou, type PhoneSession } from './phone-sessions'
import { phoneSessionStatus } from './phone-session-status'
import { usePhoneTerminalPreviewPolling } from './phone-terminal-previews'
import { usePhoneWorkbenchReveal } from './phone-workbench-target'
import {
  selectActiveWorkbenchTabId,
  selectActiveWorkbenchTabLabel
} from './phone-workspace-actions'
import { PhoneAgentsScreen } from './PhoneAgentsScreen'
import { PhoneExperimentScreen } from './PhoneExperimentScreen'
import { PhoneHeader, PhoneHeaderAction } from './PhoneHeader'
import { PhoneHomeScreen } from './PhoneHomeScreen'
import { PhoneNewAgentScreen } from './PhoneNewAgentScreen'
import { PhoneProjectScreen } from './PhoneProjectScreen'
import { PhoneFilesScreen } from './PhoneFilesScreen'
import { PhoneRunDetailScreen } from './PhoneRunDetailScreen'
import { PhoneRunsScreen } from './PhoneRunsScreen'
import { refreshAllPhoneResearchOverviews } from './phone-research-overviews'
import { PHONE_TAB_TITLES, PhoneTabBar } from './PhoneTabBar'
import { PhoneTerminalComposer } from './PhoneTerminalComposer'
import { usePhoneAttention } from './use-phone-attention'
import { usePhoneNotifyOpen } from './use-phone-notify-open'
import { usePhoneNotifySettingSync } from './use-phone-notify-setting'
import { usePhoneDrawerNavigation } from './use-phone-drawer-navigation'
import { usePhoneResearchPageRedirect } from './use-phone-research-page-redirect'
import { usePhoneSessions } from './use-phone-sessions'
import { usePhoneSessionStop } from './use-phone-session-stop'
import { useVisualViewportFrame } from './use-visual-viewport-frame'

const Terminal = lazy(() => import('@/components/Terminal'))

const PAGE_TITLES: Record<Exclude<TopLevelView, 'terminal'>, string> = {
  settings: 'Settings',
  tasks: 'Tasks',
  activity: 'Activity',
  automations: 'Automations',
  space: 'Space',
  skills: 'Skills',
  artifacts: 'Artifacts',
  mobile: 'Phone',
  'research-writing': 'Writing',
  'research-library': 'Library',
  'research-experiments': 'Experiments',
  'research-runs': 'Runs',
  'research-compare': 'Compare',
  'research-compute': 'Compute',
  'research-deadlines': 'Deadlines'
}

function PhoneTabScreen({
  tab,
  screen,
  sessions
}: {
  tab: PhoneTab
  screen: PhoneScreen | null
  sessions: PhoneSession[]
}): React.JSX.Element | null {
  if (screen?.kind === 'project') {
    return <PhoneProjectScreen projectKey={screen.projectKey} sessions={sessions} />
  }
  if (screen?.kind === 'new-agent') {
    return <PhoneNewAgentScreen initialWorktreeId={screen.worktreeId} />
  }
  if (screen?.kind === 'experiment') {
    return <PhoneExperimentScreen worktreeId={screen.worktreeId} slug={screen.experiment} />
  }
  if (screen?.kind === 'run') {
    return (
      <PhoneRunDetailScreen
        key={`${screen.worktreeId}/${screen.experiment}/${screen.run}`}
        runRef={screen}
      />
    )
  }
  switch (tab) {
    case 'home':
      return <PhoneHomeScreen sessions={sessions} />
    case 'agents':
      return <PhoneAgentsScreen sessions={sessions} />
    case 'runs':
      return <PhoneRunsScreen />
    case 'files':
      return <PhoneFilesScreen />
  }
}

/**
 * The web client's phone layout: a header, one screen, and a bottom tab bar. Sessions open the
 * desktop's own workbench full screen, and any other page renders under a Back header.
 */
export default function PhoneShell({ layout }: { layout: AppChromeLayout }): React.JSX.Element {
  usePhoneTerminalPreviewPolling()
  usePhoneDrawerNavigation()
  useCompactSidebarDrawer(true)
  const frame = useVisualViewportFrame()
  const sessions = usePhoneSessions()
  usePhoneAttention(sessions)
  usePhoneNotifyOpen(sessions)
  usePhoneNotifySettingSync()
  const tab = usePhoneNavigation((state) => state.tab)
  const screen = usePhoneNavigation(selectPhoneScreen)
  const pop = usePhoneNavigation((state) => state.pop)
  const setActiveView = useAppStore((state) => state.setActiveView)
  const openModal = useAppStore((state) => state.openModal)
  const workbenchTabLabel = useAppStore(selectActiveWorkbenchTabLabel)
  const activeWorkbenchTabId = useAppStore(selectActiveWorkbenchTabId)
  const chatOpen = useAppStore((state) => state.activeTabType === 'agent-session')
  const push = usePhoneNavigation((state) => state.push)
  const drawerOpen = useCompactDrawer((state) => state.open)
  const scrollOffsetRef = useRef(0)
  const scrollAnchorRef = useRef<VirtualizedScrollAnchor>(null)
  usePhoneResearchPageRedirect(layout.activeView)
  const page = layout.activeView === 'terminal' ? null : layout.activeView
  const workbench = page === null && screen?.kind === 'workbench' ? screen : null
  usePhoneWorkbenchReveal(workbench?.target ?? null)
  const target = workbench?.target
  // Why the active tab for a workspace screen: a new terminal or launch shows whatever it opened.
  const openTabId = target?.kind === 'session' ? target.tabId : activeWorkbenchTabId
  const openSession = target
    ? sessions.find(
        (session) => session.worktreeId === target.worktreeId && session.tabId === openTabId
      )
    : undefined
  const stopSession = usePhoneSessionStop(openSession)

  const header = page
    ? { title: PAGE_TITLES[page], onBack: () => setActiveView('terminal') }
    : screen
      ? {
          title:
            (workbench?.target.kind === 'workspace' ? workbenchTabLabel : null) ?? screen.title,
          subtitle:
            screen.kind === 'project' || screen.kind === 'new-agent'
              ? undefined
              : [screen.subtitle, openSession ? phoneSessionStatus(openSession).label : null]
                  .filter(Boolean)
                  .join(' · '),
          onBack: pop,
          destructiveAction: workbench ? stopSession : null
        }
      : {
          title: PHONE_TAB_TITLES[tab],
          actions:
            tab === 'agents' ? (
              <PhoneHeaderAction
                label="New agent"
                icon={Plus}
                onClick={() => push({ kind: 'new-agent', worktreeId: null, title: 'New agent' })}
              />
            ) : tab === 'home' ? (
              <PhoneHeaderAction
                label="Add project"
                icon={FolderPlus}
                onClick={() => openModal('add-repo')}
              />
            ) : tab === 'runs' ? (
              <PhoneHeaderAction
                label="Refresh Runs"
                icon={RefreshCw}
                onClick={refreshAllPhoneResearchOverviews}
              />
            ) : undefined
        }

  return (
    <div
      className="fixed inset-x-0 flex flex-col overflow-hidden bg-background text-foreground"
      style={{ top: frame.top, height: frame.height }}
      data-phone-shell=""
    >
      <PhoneHeader {...header} />
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {layout.shouldMountTerminalWorkbench ? (
          <TerminalWorkbenchContainer
            isVisible={workbench !== null && layout.terminalWorkbenchVisible}
          >
            <Suspense fallback={null}>
              <RecoverableRenderErrorBoundary
                boundaryId="phone.workbench"
                surface="terminal-workbench"
                resetKey="terminal"
                title="This session failed to load"
                description="Retry it. The terminal keeps running on the host."
              >
                <Terminal />
              </RecoverableRenderErrorBoundary>
            </Suspense>
          </TerminalWorkbenchContainer>
        ) : null}
        {page ? (
          <Suspense fallback={null}>
            <RecoverableRenderErrorBoundary
              boundaryId={`phone.page.${page}`}
              surface="page"
              resetKey={page}
              title="This page hit an error."
              description="Go back and open it again."
            >
              <ActivePage layout={layout} />
            </RecoverableRenderErrorBoundary>
          </Suspense>
        ) : workbench ? null : (
          <PhoneTabScreen tab={tab} screen={screen} sessions={sessions} />
        )}
      </main>
      {workbench && chatOpen ? (
        // Why: the chat brings its own composer; this keeps it off the home indicator, and drops
        // away while the keyboard is up so the composer sits right on the keys.
        <div
          aria-hidden
          className="shrink-0 bg-background"
          style={{ height: frame.keyboardOpen ? 0 : 'env(safe-area-inset-bottom)' }}
        />
      ) : workbench ? (
        <PhoneTerminalComposer />
      ) : page || screen?.kind === 'new-agent' ? null : (
        <PhoneTabBar
          needsYouCount={sessions.filter((session) => phoneSessionNeedsYou(session.state)).length}
        />
      )}
      {/* Why clipped: closed, the drawer keeps the sidebar mounted in a slot that must stay unseen;
          open, it is fixed to the viewport and escapes the clip. */}
      <div
        className="absolute inset-y-0 left-0 flex w-0 overflow-hidden"
        inert={!drawerOpen}
        aria-hidden={!drawerOpen}
      >
        <CompactSidebarDrawer
          layout={layout}
          header={<TitlebarLeftControls layout={layout} inDrawer />}
        >
          <WorktreeSidebar layout={layout} scrollRefs={{ scrollOffsetRef, scrollAnchorRef }} />
        </CompactSidebarDrawer>
      </div>
    </div>
  )
}
