import './assets/main.css'
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ConfirmationDialogProvider } from './components/confirmation-dialog'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/RecoverableRenderErrorBoundary'
import { applyDocumentAccentColor } from './lib/document-accent-color'
import { applyDocumentTheme } from './lib/document-theme'
import { buildAppFontFamily } from './lib/app-font-family'
import { getOrCreateRendererRoot } from './lib/react-renderer-root'
import { I18nProvider } from './i18n/I18nProvider'
import { useAppStore } from './store'
import { PRODUCT_NAME } from '../../shared/product-brand'
import { normalizeExecutionHostId } from '../../shared/execution-host'
import {
  RESEARCH_WINDOW_PAGES,
  RESEARCH_WINDOW_PAGE_LABELS,
  isResearchWindowPage,
  researchWindowTargetFromSearch,
  type ResearchWindowPage,
  type ResearchWindowTarget
} from '../../shared/research-page-window'
import { ResearchPreviewPage } from './features/research/ResearchPreviewPage'
import { ResearchWindowChats } from './features/research/ResearchWindowChats'
import { isResearchPage } from './features/research/research-navigation'
import { isResearchWindowState } from './features/research/research-window-state'
import { markResearchWindowSurface } from './features/research/research-window-surface'
import { selectResearchWorkspaceContext } from './features/research/research-workspace-context'

function ResearchWindowRoot({ target }: { target: ResearchWindowTarget }): React.JSX.Element {
  const { t } = useTranslation()
  const settings = useAppStore((state) => state.settings)
  const activeView = useAppStore((state) => state.activeView)
  const projectName = useAppStore(
    (state) =>
      selectResearchWorkspaceContext(state).projectName ??
      selectResearchWorkspaceContext(state).workspaceName
  )
  const [ready, setReady] = useState(false)
  const [section, setSection] = useState<ResearchWindowPage>(target.page)
  const showSection = useCallback((page: ResearchWindowPage): void => {
    setSection(page)
    if (page !== 'research-chats') {
      useAppStore.setState({ activeView: page })
    }
  }, [])

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
      ...(target.page === 'research-chats' ? {} : { activeView: target.page })
    })
    const offState = api.onState((value) => {
      if (!isResearchWindowState(value)) {
        return
      }
      useAppStore.setState({ ...value, ...pinned })
      setReady(true)
    })
    void api.requestState()
    return offState
  }, [target])

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
  const currentPage: ResearchWindowPage =
    section === 'research-chats' ? section : isResearchWindowPage(activeView) ? activeView : section
  const pageLabel = RESEARCH_WINDOW_PAGE_LABELS[currentPage]
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
        <ConfirmationDialogProvider>
          <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
              <span className="min-w-0 max-w-64 truncate text-sm font-semibold">
                {projectName ?? pageLabel}
              </span>
              <nav aria-label="Project sections" className="flex items-center gap-0.5">
                {RESEARCH_WINDOW_PAGES.map((page) => (
                  <Button
                    key={page}
                    size="xs"
                    variant={page === currentPage ? 'secondary' : 'ghost'}
                    aria-current={page === currentPage ? 'page' : undefined}
                    onClick={() => showSection(page)}
                  >
                    {RESEARCH_WINDOW_PAGE_LABELS[page]}
                  </Button>
                ))}
              </nav>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() =>
                  void window.api.researchWindow.revealInMain({ ...target, page: currentPage })
                }
              >
                <ExternalLink aria-hidden />
                {t('research.window.openInMain', 'Open in main window')}
              </Button>
            </header>
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {!ready ? (
                <p role="status" className="p-6 text-sm text-muted-foreground">
                  {t('research.window.loading', 'Loading…')}
                </p>
              ) : section === 'research-chats' ? (
                <ResearchWindowChats target={target} />
              ) : isResearchPage(activeView) ? (
                <ResearchPreviewPage page={activeView} />
              ) : (
                <ResearchPreviewPage page={section} />
              )}
            </main>
          </div>
        </ConfirmationDialogProvider>
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
document.title = `${RESEARCH_WINDOW_PAGE_LABELS[target.page]} — ${PRODUCT_NAME}`
getOrCreateRendererRoot(root, import.meta.hot?.data).render(
  <StrictMode>
    <I18nProvider>
      <ResearchWindowRoot target={target} />
    </I18nProvider>
  </StrictMode>
)
