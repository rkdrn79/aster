import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'
import {
  researchRunStatusSummary,
  type ResearchRunStatusFacts,
  type ResearchRunStatusTone
} from './research-run-status-label'

const TONE_DOT: Record<ResearchRunStatusTone, string | null> = {
  running: 'bg-status-success',
  succeeded: 'bg-muted-foreground/50',
  failed: 'bg-destructive',
  cancelled: 'bg-muted-foreground/30',
  stalled: 'bg-status-warning',
  unknown: null
}

/** A Run's status as a dot and a few words; a running Run's elapsed time keeps counting. */
export function ResearchRunStatusLine({
  facts,
  className
}: {
  facts: ResearchRunStatusFacts
  className?: string
}): React.JSX.Element {
  const now = useNow(10_000, facts.state === 'running')
  const { label, tone } = researchRunStatusSummary(facts, now)
  const dot = TONE_DOT[tone]
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {dot ? <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dot)} /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}
