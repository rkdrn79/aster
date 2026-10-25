import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ResearchLoopLedger } from '../../../../shared/research/research-harness-results'
import {
  LOOP_ENTRY_LABELS,
  researchLoopBudgetText,
  researchLoopMetricText,
  researchLoopProgress,
  type ResearchLoopProgress
} from './research-loop-format'
import { researchRelativeTime } from './research-relative-time'

const COLLAPSED_ENTRIES = 8

function LoopState({ progress }: { progress: ResearchLoopProgress }): React.JSX.Element | null {
  const label = progress.overBudget
    ? 'Over budget'
    : progress.phase === 'waiting'
      ? 'Waiting on you'
      : progress.phase === 'ended'
        ? 'Ended'
        : progress.budgetUsed
          ? 'Budget used'
          : null
  if (!label) {
    return null
  }
  const when =
    progress.phase !== 'active' && progress.stoppedAt
      ? researchRelativeTime(progress.stoppedAt)
      : null
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          progress.overBudget || progress.phase === 'waiting' || progress.budgetUsed
            ? 'bg-status-warning'
            : 'bg-muted-foreground/50'
        )}
      />
      {label}
      {when ? <span className="font-normal text-muted-foreground">{when}</span> : null}
    </span>
  )
}

/** An Experiment's autonomous loop: what it optimizes, how much budget is left, and its steps. */
export function ResearchLoopSummary({
  ledger,
  running
}: {
  ledger: ResearchLoopLedger
  /** A Run of the Experiment is running, so a quiet ledger still means the loop is working. */
  running: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const progress = researchLoopProgress(ledger, { running })
  // Why: the current objective already heads the card.
  const timeline = ledger.entries.filter((entry) => entry.id !== ledger.objective?.id).toReversed()
  const shown = expanded ? timeline : timeline.slice(0, COLLAPSED_ENTRIES)
  const metric = researchLoopMetricText(ledger)
  const budget = ledger.budget

  return (
    <section
      aria-label="Research loop"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Research loop
        </h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {budget
            ? researchLoopBudgetText(budget, progress.hoursElapsed ?? budget.hoursElapsed)
            : null}
          <LoopState progress={progress} />
        </span>
      </div>
      {ledger.objective ? (
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{ledger.objective.text}</p>
          {metric ? <p className="text-xs text-muted-foreground">{metric}</p> : null}
        </div>
      ) : null}
      {ledger.openHypotheses.length ? (
        <div className="space-y-1">
          <h3 className="text-xs font-medium">Open hypotheses</h3>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {ledger.openHypotheses.map((item) => (
              <li key={item.id} className="truncate" title={item.text}>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {shown.length ? (
        <ol className="space-y-1 border-t border-border pt-3 text-xs" aria-label="Loop steps">
          {shown.map((entry) => (
            <li
              key={entry.id}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3"
            >
              <span
                className={cn(
                  'flex items-center gap-1.5 text-muted-foreground',
                  entry.kind === 'decision' && 'text-foreground'
                )}
              >
                {entry.kind === 'checkpoint' ? (
                  <span aria-hidden className="size-1.5 rounded-full bg-status-warning" />
                ) : null}
                {LOOP_ENTRY_LABELS[entry.kind] ?? entry.kind}
              </span>
              <span className="truncate" title={entry.text}>
                {entry.text}
              </span>
              <time className="text-muted-foreground" dateTime={entry.at}>
                {researchRelativeTime(entry.at)}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
      {timeline.length > COLLAPSED_ENTRIES ? (
        <Button size="xs" variant="ghost" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show fewer' : `Show all ${timeline.length}`}
        </Button>
      ) : null}
    </section>
  )
}
