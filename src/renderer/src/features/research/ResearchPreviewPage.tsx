import { Suspense, lazy } from 'react'
import type { ResearchPage } from './research-navigation'
import { ResearchRunsPage } from './ResearchRunsPage'
import { ResearchComparePage } from './ResearchComparePage'
import { ResearchWritingPage } from './ResearchWritingPage'
import { ResearchLibraryPage } from './ResearchLibraryPage'
import { ResearchExperimentsPage } from './ResearchExperimentsPage'
import { ResearchDesktopOnlyPage } from './ResearchDesktopOnlyPage'
import { isWebClientLocation } from '@/lib/web-client-location'

const ResearchComputePage = lazy(() =>
  import('./ResearchComputePage').then((module) => ({ default: module.ResearchComputePage }))
)
const ResearchDeadlinesPage = lazy(() =>
  import('./ResearchDeadlinesPage').then((module) => ({ default: module.ResearchDeadlinesPage }))
)

// Why: these pages read desktop-only research bridges; Writing reads files and compiles on the host.
const DESKTOP_ONLY_PAGE_TITLES: Partial<Record<ResearchPage, string>> = {
  'research-library': 'Library',
  'research-experiments': 'Experiments',
  'research-compare': 'Compare',
  'research-runs': 'Runs',
  'research-compute': 'Compute',
  'research-deadlines': 'Deadlines'
}

export function ResearchPreviewPage({ page }: { page: ResearchPage }): React.JSX.Element {
  const desktopOnlyTitle = DESKTOP_ONLY_PAGE_TITLES[page]
  if (desktopOnlyTitle && isWebClientLocation()) {
    return <ResearchDesktopOnlyPage title={desktopOnlyTitle} />
  }
  switch (page) {
    case 'research-writing':
      return <ResearchWritingPage />
    case 'research-library':
      return <ResearchLibraryPage />
    case 'research-experiments':
      return <ResearchExperimentsPage />
    case 'research-compare':
      return <ResearchComparePage />
    case 'research-runs':
      return <ResearchRunsPage />
    case 'research-compute':
      return (
        <Suspense
          fallback={
            <p role="status" className="p-6 text-sm text-muted-foreground">
              Loading Compute…
            </p>
          }
        >
          <ResearchComputePage />
        </Suspense>
      )
    case 'research-deadlines':
      return (
        <Suspense
          fallback={
            <p role="status" className="p-6 text-sm text-muted-foreground">
              Loading Deadlines…
            </p>
          }
        >
          <ResearchDeadlinesPage />
        </Suspense>
      )
  }
}
