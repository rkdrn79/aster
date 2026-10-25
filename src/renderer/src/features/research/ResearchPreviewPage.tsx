import { Suspense, lazy } from 'react'
import type { ResearchPage } from './research-navigation'
import { ResearchRunsPage } from './ResearchRunsPage'
import { ResearchComparePage } from './ResearchComparePage'
import { ResearchWritingPage } from './ResearchWritingPage'
import { ResearchLibraryPage } from './ResearchLibraryPage'
import { ResearchExperimentsPage } from './ResearchExperimentsPage'

const ResearchComputePage = lazy(() =>
  import('./ResearchComputePage').then((module) => ({ default: module.ResearchComputePage }))
)
const ResearchDeadlinesPage = lazy(() =>
  import('./ResearchDeadlinesPage').then((module) => ({ default: module.ResearchDeadlinesPage }))
)

export function ResearchPreviewPage({ page }: { page: ResearchPage }): React.JSX.Element {
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
