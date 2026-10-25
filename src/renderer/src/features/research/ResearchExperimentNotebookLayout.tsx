import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ResearchFindingSeverity } from '../../../../shared/research/research-quality-findings'
import { FINDING_SEVERITY_DOT, FINDING_SEVERITY_LABELS } from './research-findings-format'

/** One notebook section: a quiet label, an optional action on its right, and its content. */
export function NotebookSection({
  label,
  action,
  children
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={label} className="space-y-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </h2>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** A severity dot in a notebook row's marker column. */
export function NotebookSeverityMarker({
  severity
}: {
  severity: ResearchFindingSeverity
}): React.JSX.Element {
  return (
    <span
      role="img"
      aria-label={FINDING_SEVERITY_LABELS[severity]}
      className={cn('size-1.5 rounded-full', FINDING_SEVERITY_DOT[severity])}
    />
  )
}

/** One notebook list row: a marker, what it is, where it came from, and up to two actions. */
export function NotebookRow({
  marker,
  title,
  meta,
  actions,
  children,
  className,
  ...rest
}: Omit<React.ComponentProps<'li'>, 'title'> & {
  marker: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <li className={cn('flex items-start gap-3 py-2.5', className)} {...rest}>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground">
        {marker}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="min-w-0 text-sm">{title}</div>
        {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </li>
  )
}

/** An unsaved plan or conclusion kept after its editor closed: resume it or drop it. */
export function NotebookDraftNotice({
  label,
  preview,
  onResume,
  onDiscard
}: {
  label: string
  preview?: string | null
  onResume: () => void
  onDiscard: () => void
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="space-y-1 rounded-md border border-dashed border-border px-3 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">Draft</span>
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          <Button size="xs" variant="ghost" onClick={onResume}>
            Continue editing
          </Button>
          <Button size="xs" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        </span>
      </div>
      {preview ? (
        <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{preview}</p>
      ) : null}
    </div>
  )
}
