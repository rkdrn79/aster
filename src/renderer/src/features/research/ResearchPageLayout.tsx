import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCompactViewport, useLeftSidebarDocked } from '@/app-shell/use-compact-viewport'
import { ResearchSplitButton } from './ResearchSplitButton'
import { isResearchWindowSurface } from './research-window-surface'

type ResearchPageHeaderProps = {
  title: string
  /** Context such as the selected Experiment; it truncates when the center pane is narrow. */
  context?: React.ReactNode
  actions?: React.ReactNode
}

/** The slim header every research page shares. Actions wrap below the title when panes get narrow. */
export function ResearchPageHeader({
  title,
  context,
  actions
}: ResearchPageHeaderProps): React.JSX.Element {
  const sidebarOpen = useLeftSidebarDocked()
  const compactViewport = useCompactViewport()

  return (
    <header
      data-research-page-header=""
      className="relative flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background py-2 pl-6"
      style={
        compactViewport
          ? { paddingRight: '1.5rem' }
          : {
              // Why: collapsed, the floating window controls sit over the header's top-left corner.
              paddingLeft: sidebarOpen
                ? undefined
                : 'calc(var(--collapsed-sidebar-header-width) + 1rem)',
              // Why: keeps actions clear of window controls and the Workbench's right-sidebar toggle.
              paddingRight: 'calc(var(--window-controls-width, 0px) + 2.5rem)'
            }
      }
    >
      {/* Why: the header drags the window, and Electron lets only a no-drag descendant carve a drag
          region; the floating controls painted over these padding strips are siblings, so without
          these they would move the window instead of taking the click. */}
      {sidebarOpen ? null : (
        <div
          aria-hidden
          data-research-page-header-clearance="left"
          className="absolute inset-y-0 left-0 [-webkit-app-region:no-drag]"
          style={{ width: 'calc(var(--collapsed-sidebar-header-width) + 1rem)' }}
        />
      )}
      {compactViewport ? null : (
        <div
          aria-hidden
          data-research-page-header-clearance="right"
          className="absolute inset-y-0 right-0 [-webkit-app-region:no-drag]"
          style={{ width: 'calc(var(--window-controls-width, 0px) + 2.5rem)' }}
        />
      )}
      {compactViewport && !isResearchWindowSurface() ? (
        // Why: on a phone only the first row clears the floating controls, so wrapped actions get the full width.
        // A narrow project window or side lays out like a phone but has no controls floating there.
        <div
          aria-hidden
          className="h-7 shrink-0"
          style={{ width: 'calc(var(--collapsed-sidebar-header-width) - 1.5rem)' }}
        />
      ) : null}
      <div className="flex min-w-0 flex-[1_1_12rem] items-baseline gap-2">
        <h1 className="max-w-full shrink-0 truncate text-base font-semibold leading-tight">
          {title}
        </h1>
        {context ? (
          <span className="min-w-0 truncate text-sm text-muted-foreground">{context}</span>
        ) : null}
      </div>
      <div data-research-page-actions="" className="flex min-w-0 flex-wrap items-center gap-2">
        {actions}
        <ResearchSplitButton />
      </div>
    </header>
  )
}

/** Scrolling content under the header, on the same left edge as the title. */
export function ResearchPageBody({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('scrollbar-sleek min-h-0 flex-1 overflow-auto px-6 py-5', className)}>
      {children}
    </div>
  )
}

/** What a page shows when it has nothing yet; every page says so the same way. */
export function ResearchEmptyState({
  icon: Icon,
  title,
  children,
  action
}: {
  icon?: LucideIcon
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      {Icon ? <Icon className="mb-3 size-4.5 text-muted-foreground" aria-hidden /> : null}
      <h2 className="text-sm font-medium">{title}</h2>
      {children ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Rarely needed facts (paths, commits, provenance), collapsed under one "Details" line. */
export function ResearchDetails({
  rows,
  summary = 'Details',
  children
}: {
  rows: readonly (readonly [label: string, value: React.ReactNode])[]
  summary?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <details className="text-xs">
      <summary className="w-fit cursor-pointer select-none rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {summary}
      </summary>
      <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1">
        {rows.map(([label, value], index) => (
          <div key={`${index}:${label}`} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </details>
  )
}
