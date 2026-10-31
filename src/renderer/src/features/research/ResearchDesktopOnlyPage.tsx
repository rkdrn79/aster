import { Monitor } from 'lucide-react'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'

/**
 * A Research page whose records live behind a desktop-only bridge. The web client's fallback for
 * those bridges answers empty or undefined, so the page would read blank or throw instead.
 */
export function ResearchDesktopOnlyPage({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <ResearchPageHeader title={title} />
      <ResearchPageBody>
        <ResearchEmptyState icon={Monitor} title="Available in the desktop app">
          {title} reads records that only the desktop app keeps. Open Aster on your computer to use
          it here.
        </ResearchEmptyState>
      </ResearchPageBody>
    </div>
  )
}
