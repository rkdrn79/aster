import './assets/main.css'
import { StrictMode, useEffect, useState } from 'react'
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
  RESEARCH_WINDOW_PAGE_LABELS,
  isResearchWindowPage,
  researchWindowTargetFromSearch,
  type ResearchWindowTarget
} from '../../shared/research-page-window'
import { ResearchPreviewPage } from './features/research/ResearchPreviewPage'
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

  useEffect(() => {
    const api = window.api.researchWindow
    // Why pinned: the window shows the workspace it was dragged from, whatever the main window opens next.
    const pinned = {
      activeWorktreeId: target.workspaceId,
      activeWorkspaceExecutionHostId: normalizeExecutionHostId(target.hostId)
    }
    useAppStore.setState({ ...pinned, activeView: target.page })
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

  const pageLabel = RESEARCH_WINDOW_PAGE_LABELS[target.page]
  useEffect(() => {
    document.title = projectName
      ? `${pageLabel} · ${projectName} — ${PRODUCT_NAME}`
      : `${pageLabel} — ${PRODUCT_NAME}`
  }, [pageLabel, projectName])

  // The page the window shows now: an Experiment opened inside it keeps its Experiments label.
  const currentPage = isResearchWindowPage(activeView) ? activeView : target.page
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="research-window.root"
      surface="app-root"
      title={t('research.window.errorTitle', 'This window hit an error.')}
      description={t('research.window.errorDescription', 'Close it and drag the page out again.')}
    >
      <TooltipProvider delayDuration={400}>
        <ConfirmationDialogProvider>
          <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
              <span className="min-w-0 truncate text-sm font-semibold">
                {projectName ?? pageLabel}
              </span>
              {projectName ? (
                <span className="shrink-0 text-xs text-muted-foreground">{pageLabel}</span>
              ) : null}
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
              ) : isResearchPage(activeView) ? (
                <ResearchPreviewPage page={activeView} />
              ) : (
                <ResearchPreviewPage page={target.page} />
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
