import type { LucideIcon } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'

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
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)

  return (
    <header
      data-research-page-header=""
      className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border bg-background py-2 pl-6"
      style={{
        // Why: collapsed, the floating window controls sit over the header's top-left corner.
        paddingLeft: sidebarOpen ? undefined : 'calc(var(--collapsed-sidebar-header-width) + 1rem)',
        // Why: keeps actions clear of window controls and the Workbench's right-sidebar toggle.
        paddingRight: 'calc(var(--window-controls-width, 0px) + 2.5rem)'
      }}
    >
      <div className="flex min-w-0 flex-[1_1_12rem] items-baseline gap-2">
        <h1 className="max-w-full shrink-0 truncate text-base font-semibold leading-tight">
          {title}
        </h1>
        {context ? (
          <span className="min-w-0 truncate text-sm text-muted-foreground">{context}</span>
        ) : null}
      </div>
      {actions ? (
        <div data-research-page-actions="" className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
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
      {Icon ? <Icon className="mb-3 size-6 text-muted-foreground" aria-hidden /> : null}
      <h2 className="text-sm font-medium">{title}</h2>
      {children ? (
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{children}</p>
      ) : null}
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
