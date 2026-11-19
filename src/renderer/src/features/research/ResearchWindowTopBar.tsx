import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SegmentIndicator, useSegmentIndicator } from '@/components/ui/segment-indicator'
import { cn } from '@/lib/utils'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { uiZoomFactorFromLevel } from '../../../../shared/ui-zoom-level'
import {
  RESEARCH_WINDOW_PAGES,
  RESEARCH_WINDOW_PAGE_LABELS,
  type ResearchWindowPage
} from '../../../../shared/research-page-window'

/** Keeps `--ui-zoom-factor` current here; the main window publishes its own, this window follows it. */
function useZoomFactorVariable(): void {
  useEffect(() => {
    const publish = (): void => {
      const level = window.api?.ui?.getZoomLevel?.() ?? 0
      document.documentElement.style.setProperty(
        '--ui-zoom-factor',
        String(uiZoomFactorFromLevel(level))
      )
    }
    publish()
    // Why resize: a zoom change resizes the CSS viewport, and no other event reaches this window.
    window.addEventListener('resize', publish)
    return () => window.removeEventListener('resize', publish)
  }, [])
}

/**
 * The project window's title bar: the project, its pages, and the way back to the main window.
 * On macOS it is the window's title bar too, so it is a drag region with the traffic lights at its
 * start; the current page is a raised pill that slides between pages.
 */
export function ResearchWindowTopBar({
  title,
  currentPage,
  onShowSection,
  onOpenInMain
}: {
  title: string
  currentPage: ResearchWindowPage
  onShowSection: (page: ResearchWindowPage) => void
  onOpenInMain: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const setNav = useSegmentIndicator<HTMLElement>('[aria-current="page"]', true)
  const isMac = getShortcutPlatform() === 'darwin'
  useZoomFactorVariable()
  return (
    <header
      className={cn(
        'flex h-11 shrink-0 items-center gap-3 pr-2 select-none [-webkit-app-region:drag]',
        // Why divide by the zoom: the traffic lights keep their window-point size at any UI zoom.
        isMac ? 'pl-[calc(84px/var(--ui-zoom-factor,1))]' : 'pl-3'
      )}
    >
      <span className="min-w-0 max-w-56 truncate text-[13px] font-medium">{title}</span>
      <nav
        ref={setNav}
        aria-label="Project sections"
        className="group/pages relative flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none [-webkit-app-region:no-drag]"
      >
        <SegmentIndicator />
        {RESEARCH_WINDOW_PAGES.map((page) => {
          const current = page === currentPage
          return (
            <button
              key={page}
              type="button"
              aria-current={current ? 'page' : undefined}
              onClick={() => onShowSection(page)}
              className={cn(
                'relative h-7 shrink-0 rounded-full px-3 text-[13px] whitespace-nowrap outline-none transition-colors duration-(--duration-fast) focus-visible:ring-[3px] focus-visible:ring-ring/40',
                current
                  ? // Before the sliding pill is measured, the current page paints its own.
                    'bg-raised font-medium text-foreground shadow-raised group-data-[segment-indicator]/pages:bg-transparent group-data-[segment-indicator]/pages:shadow-none'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {RESEARCH_WINDOW_PAGE_LABELS[page]}
            </button>
          )
        })}
      </nav>
      <div className="ml-auto flex shrink-0 items-center [-webkit-app-region:no-drag]">
        <Button variant="ghost" size="xs" onClick={onOpenInMain}>
          <ExternalLink aria-hidden />
          {t('research.window.openInMain', 'Open in main window')}
        </Button>
      </div>
    </header>
  )
}
