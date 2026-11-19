import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { lossText, type PlanBudgetFit } from '../../../../research-harness/research-plan-fit.mjs'
import { formatHours } from './research-plan-view-state'
import { NOTICE_CARD } from './research-surface-classes'

const SHOWN = 8

/**
 * When the kept runs take more than the compute less its spare share: the lowest-priority runs to
 * cut, each with what it loses. Taking them only unchecks them; the person still approves.
 */
export function ResearchPlanFit({
  fit,
  readOnly,
  onApply
}: {
  fit: PlanBudgetFit
  readOnly: boolean
  onApply: () => void
}): React.JSX.Element | null {
  if (readOnly || fit.plannableGpuHours === null || !fit.suggestions.length) {
    return null
  }
  const spare = Math.round(fit.budget.reserve * 100)
  const shown = fit.suggestions.slice(0, SHOWN)
  const hidden = fit.suggestions.length - shown.length
  return (
    <div className={cn(NOTICE_CARD, 'mt-3 p-3 text-xs')} aria-live="polite">
      <div className="flex flex-wrap items-start gap-3">
        <p className="min-w-0 flex-1">
          Kept runs take {formatHours(fit.keptGpuHours)} GPU-h. With {spare}% kept spare for reruns,{' '}
          {formatHours(fit.plannableGpuHours)} fit. Lowest priority first, these would make room:
        </p>
        <Button size="xs" variant="outline" onClick={onApply}>
          Cut {fit.suggestions.length === 1 ? 'this run' : `these ${fit.suggestions.length} runs`}
        </Button>
      </div>
      <ul className="mt-2 space-y-1">
        {shown.map((entry) => {
          const loss = lossText(entry.loses)
          return (
            <li key={entry.cell} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono">{entry.cell}</span>
              <span className="tabular-nums text-muted-foreground">
                {entry.tier} · {formatHours(entry.gpuHours)} h
              </span>
              <span className={loss ? 'text-status-warning' : 'text-muted-foreground'}>
                {loss ?? 'No claim or reviewer request loses its evidence'}
              </span>
            </li>
          )
        })}
      </ul>
      {hidden > 0 ? (
        <p className="mt-1 text-muted-foreground">
          And {hidden} more {hidden === 1 ? 'run' : 'runs'}.
        </p>
      ) : null}
      {fit.fitsAfter ? null : (
        <p className="mt-2 text-destructive">
          Even these cuts leave it over: state more compute or cut must runs.
        </p>
      )}
    </div>
  )
}
