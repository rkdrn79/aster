import { cn } from '@/lib/utils'
import { RAISED_CARD, SECTION_TITLE } from './research-surface-classes'

/** One part of the Plan view: a raised card with a title, a one-line hint and an optional action. */
export function PlanSection({
  title,
  hint,
  action,
  className,
  children
}: {
  title: string
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={title} className={cn(RAISED_CARD, 'p-4', className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className={SECTION_TITLE}>{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
