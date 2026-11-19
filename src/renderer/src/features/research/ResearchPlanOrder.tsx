import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PlanRunOrder } from '../../../../research-harness/research-plan-view.mjs'
import type { ResearchPlanCell } from '../../../../shared/research/research-plans'
import { formatHours } from './research-plan-view-state'
import { TAG_CHIP } from './research-surface-classes'
import { PlanSection } from './ResearchPlanSection'

/** Sanity → cheap falsifier → main → ablations → generality, each stage with its gate. */
export function ResearchPlanOrder({
  order,
  cells,
  approved,
  onProposeStage
}: {
  order: PlanRunOrder
  cells: readonly ResearchPlanCell[]
  approved: boolean
  onProposeStage: (stage: string) => Promise<void>
}): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const byId = new Map(cells.map((cell) => [cell.cell, cell]))
  return (
    <PlanSection
      title="Run order"
      hint={
        approved
          ? 'Approving proposed the first stage. Propose the next stage once its gate has passed.'
          : 'Cheap stages first; each stage ends at a gate you confirm.'
      }
    >
      <ol className="space-y-3">
        {order.stages.map((stage, index) => {
          const kept = stage.cells.map((id) => byId.get(id)).filter((cell) => cell !== undefined)
          const proposed = kept.filter((cell) => cell.proposed).length
          const pending = kept.length - proposed
          return (
            <li key={stage.id} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-foreground/6 text-2xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium">{stage.name}</span>
                  <span className="font-mono text-2xs text-muted-foreground">{stage.id}</span>
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {formatHours(stage.gpuHours)} GPU-h
                    {stage.budgetGpuHours !== null
                      ? ` of ${formatHours(stage.budgetGpuHours)}`
                      : ''}
                    {' · '}
                    {kept.length} {kept.length === 1 ? 'run' : 'runs'}
                  </span>
                  {proposed ? <span className={TAG_CHIP}>{proposed} proposed</span> : null}
                </div>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  Gate: {stage.gate ?? 'none set'}
                </p>
                {kept.length ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {kept.map((cell) => (
                      <span key={cell.cell} className={cn(TAG_CHIP, 'font-mono')}>
                        {cell.cell}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
              {approved && index > 0 && pending > 0 ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="shrink-0 self-start"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(stage.id)
                    void onProposeStage(stage.id).finally(() => setBusy(null))
                  }}
                >
                  {busy === stage.id ? 'Proposing…' : `Propose ${stage.id} runs`}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ol>
    </PlanSection>
  )
}
