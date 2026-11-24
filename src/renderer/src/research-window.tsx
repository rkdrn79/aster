import './assets/main.css'
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from './components/confirmation-dialog'
import EditorAutosaveController from './components/editor/EditorAutosaveController'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/RecoverableRenderErrorBoundary'
import { applyDocumentAccentColor } from './lib/document-accent-color'
import { applyDocumentTheme } from './lib/document-theme'
import { buildAppFontFamily } from './lib/app-font-family'
import { getOrCreateRendererRoot } from './lib/react-renderer-root'
import { I18nProvider } from './i18n/I18nProvider'
import { useAppStore } from './store'
import { PRODUCT_NAME } from '../../shared/product-brand'
import { normalizeExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import {
  RESEARCH_WINDOW_PAGE_LABELS,
  isResearchWindowPage,
  researchWindowTargetFromSearch,
  type ResearchWindowPage,
  type ResearchWindowTarget
} from '../../shared/research-page-window'
import { ResearchPreviewPage } from './features/research/ResearchPreviewPage'
import { ResearchWindowChats } from './features/research/ResearchWindowChats'
import { ResearchSubtaskInspectDialog } from './features/research/ResearchSubtaskStrip'
import { isResearchPage } from './features/research/research-navigation'
import { isResearchWindowState } from './features/research/research-window-state'
import {
  markResearchWindowSide,
  markResearchWindowSurface,
  openChatInResearchWindow,
  setResearchWindowChatsSection
} from './features/research/research-window-surface'
import { researchSideIdFromSearch } from '../../shared/research-side-split'
import {
  useResearchSideControlsInset,
  useResearchSideReports
} from './features/research/use-research-side-reports'
import { ResearchSideSidebar } from './features/research/ResearchSideSidebar'
import { useFollowResearchSideFocus } from './features/research/ResearchNavigationProjectRow'
import { hydrateResearchSideSidebar } from './features/research/research-side-sidebar'
import { researchSidePageForView } from './features/research/research-side-page'
import { useResearchProjectSwitcherShortcut } from './features/research/use-research-project-switcher-shortcut'
import { ResearchWindowHostBanner } from './features/research/ResearchWindowHostBanner'
import { ResearchWindowRemoteServices } from './features/research/ResearchWindowRemoteServices'
import { ResearchWindowPalette } from './features/research/ResearchWindowPalette'
import { ResearchWindowTopBar } from './features/research/ResearchWindowTopBar'
import { selectResearchWorkspaceContext } from './features/research/research-workspace-context'
import { replaceRuntimeEnvironmentRevisions } from './runtime/runtime-environment-revision'
import { disableStructuredAgentLaunchPersistence } from './lib/structured-agent-session-launch-persistence'
import { useResearchWindowEditServices } from './features/research/use-research-window-edit-services'

function ResearchWindowRoot({
  target,
  sideId
}: {
  target: ResearchWindowTarget
  sideId: string | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const settings = useAppStore((state) => state.settings)
  const activeView = useAppStore((state) => state.activeView)
  const projectName = useAppStore(
    (state) =>
      selectResearchWorkspaceContext(state).projectName ??
      selectResearchWorkspaceContext(state).workspaceName
  )
  const hostId = useAppStore((state) => selectResearchWorkspaceContext(state).hostId)
  const onRemoteHost = parseExecutionHostId(hostId)?.kind === 'runtime'
  useResearchWindowEditServices()
  const [ready, setReady] = useState(false)
  const [waitingForMain, setWaitingForMain] = useState(false)
  const [section, setSection] = useState<ResearchWindowPage>(target.page)
  const showSection = useCallback(
    (page: ResearchWindowPage): void => {
      setSection(page)
      if (page !== 'research-chats') {
        useAppStore.setState({ activeView: page })
      } else if (sideId) {
        // Why: a side's Chats are its Workbench, as its sidebar names them.
        useAppStore.setState({ activeView: 'terminal' })
      }
    },
    [sideId]
  )
  useResearchProjectSwitcherShortcut(sideId !== null)

  useEffect(() => {
    setResearchWindowChatsSection(() => showSection('research-chats'))
    return () => setResearchWindowChatsSection(null)
  }, [showSection])

  useEffect(
    () =>
      window.api.researchWindow.onShowPage((page) => {
        if (isResearchWindowPage(page)) {
          showSection(page)
        }
      }),
    [showSection]
  )

  useEffect(() => {
    const api = window.api.researchWindow
    // Why pinned: the window shows the workspace it was dragged from, whatever the main window opens next.
    const pinned = {
      activeWorktreeId: target.workspaceId,
      activeWorkspaceExecutionHostId: normalizeExecutionHostId(target.hostId)
    }
    useAppStore.setState({
      ...pinned,
      ...(target.page !== 'research-chats'
        ? { activeView: target.page }
        : sideId
          ? { activeView: 'terminal' as const }
          : {})
    })
    const offState = api.onState((value) => {
      if (!isResearchWindowState(value)) {
        return
      }
      // Why: this renderer's own record of each host's pairing, which its host requests carry.
      replaceRuntimeEnvironmentRevisions(value.runtimeEnvironments)
      useAppStore.setState({ ...value, ...pinned })
      setReady(true)
    })
    void api.requestState()
    return offState
  }, [target, sideId])

  // Why: the main window can be reloading when this opens or reopens; keep asking until it answers.
  useEffect(() => {
    if (ready) {
      return
    }
    const retry = setInterval(() => void window.api.researchWindow.requestState(), 2000)
    const stillWaiting = setTimeout(() => setWaitingForMain(true), 8000)
    return () => {
      clearInterval(retry)
      clearTimeout(stillWaiting)
    }
  }, [ready])

  useEffect(() => {
    applyDocumentTheme(settings?.theme ?? 'system', { disableTransitions: false })
    applyDocumentAccentColor(settings?.accentColor)
    document.documentElement.style.setProperty(
      '--app-font-family',
      buildAppFontFamily(settings?.appFontFamily)
    )
    if (settings?.theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (): void => applyDocumentTheme('system')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [settings?.theme, settings?.appFontFamily, settings?.accentColor])

  // An Experiment opened inside the window keeps the Experiments section current.
  const currentPage: ResearchWindowPage = sideId
    ? researchSidePageForView(activeView, section)
    : section === 'research-chats'
      ? section
      : isResearchWindowPage(activeView)
        ? activeView
        : section
  // A side's sidebar opens its Workbench (its chats) as the main window's does: by the view.
  const showChats = sideId ? activeView === 'terminal' : section === 'research-chats'
  const pageLabel = RESEARCH_WINDOW_PAGE_LABELS[currentPage]
  const openInMain = useCallback(
    () => void window.api.researchWindow.revealInMain({ ...target, page: currentPage }),
    [target, currentPage]
  )
  useResearchSideReports(sideId, currentPage)
  useResearchSideControlsInset(sideId)
  useFollowResearchSideFocus(sideId)
  useEffect(
    () =>
      window.api.researchWindow.onShowChat((tabId) => {
        if (typeof tabId === 'string') {
          openChatInResearchWindow(target.workspaceId, tabId)
        }
      }),
    [target.workspaceId]
  )
  useEffect(() => {
    document.title = projectName
      ? `${projectName} — ${PRODUCT_NAME}`
      : `${pageLabel} — ${PRODUCT_NAME}`
  }, [pageLabel, projectName])
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="research-window.root"
      surface="app-root"
      title={t('research.window.errorTitle', 'This window hit an error.')}
      description={t('research.window.errorDescription', 'Close it and open the project again.')}
    >
      <TooltipProvider delayDuration={400}>
        {onRemoteHost ? <ResearchWindowRemoteServices /> : null}
        {/* Why: the Writing editor saves through this; the main window's lives in its terminal view. */}
        <EditorAutosaveController />
        <ConfirmationDialogProvider>
          {/* Why the shell: like the main window, the page is an inset panel under a title bar.
              A side shows its project's sidebar panel beside its page panel instead. */}
          <div
            className={
              sideId
                ? 'flex h-screen min-h-0 gap-2 bg-shell text-foreground'
                : 'flex h-screen min-h-0 flex-col bg-shell text-foreground'
            }
          >
            {sideId && ready ? <ResearchSideSidebar /> : null}
            {sideId ? null : (
              <ResearchWindowTopBar
                title={projectName ?? pageLabel}
                currentPage={currentPage}
                onShowSection={showSection}
                onOpenInMain={openInMain}
              />
            )}
            <main
              className={
                sideId
                  ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-background'
                  : 'mx-2 mb-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-background'
              }
            >
              {ready ? <ResearchWindowHostBanner /> : null}
              {!ready ? (
                <p role="status" className="p-6 text-sm text-muted-foreground">
                  {waitingForMain
                    ? t('research.window.waitingForMain', 'Waiting for the main window…')
                    : t('research.window.loading', 'Loading…')}
                </p>
              ) : showChats ? (
                <ResearchWindowChats target={target} />
              ) : isResearchPage(activeView) ? (
                <ResearchPreviewPage page={activeView} />
              ) : section === 'research-chats' ? (
                <ResearchWindowChats target={target} />
              ) : (
                <ResearchPreviewPage page={section} />
              )}
            </main>
          </div>
          <ResearchSubtaskInspectDialog />
        </ConfirmationDialogProvider>
        {ready ? (
          <ResearchWindowPalette
            workspaceId={target.workspaceId}
            hostId={hostId}
            onShowSection={showSection}
            onOpenInMain={sideId ? undefined : openInMain}
          />
        ) : null}
        <Toaster closeButton toastOptions={{ className: 'font-sans text-sm' }} />
      </TooltipProvider>
    </RecoverableRenderErrorBoundary>
  )
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Research window root not found.')
}
const target = researchWindowTargetFromSearch(window.location.search)
if (!target) {
  throw new Error('Research window opened without a page.')
}
markResearchWindowSurface(target)
const windowSideId = researchSideIdFromSearch(window.location.search)
markResearchWindowSide(windowSideId)
hydrateResearchSideSidebar()
// Why: launches started here go through the main window, whose records would read as stale here.
disableStructuredAgentLaunchPersistence()
document.title = `${RESEARCH_WINDOW_PAGE_LABELS[target.page]} — ${PRODUCT_NAME}`
getOrCreateRendererRoot(root, import.meta.hot?.data).render(
  <StrictMode>
    <I18nProvider>
      <ResearchWindowRoot target={target} sideId={windowSideId} />
    </I18nProvider>
  </StrictMode>
)
