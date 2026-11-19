import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PlanTierTotals } from '../../../../research-harness/research-plan-view.mjs'
import { formatHours } from './research-plan-view-state'
import { PlanSection } from './ResearchPlanSection'

const TIER_FILL = {
  must: 'bg-foreground/60',
  should: 'bg-foreground/30',
  could: 'bg-foreground/15'
} as const

const TIER_LABEL = { must: 'Must', should: 'Should', could: 'Could' } as const

function percent(value: number, scale: number): string {
  return `${scale > 0 ? Math.min(100, (value / scale) * 100) : 0}%`
}

function ComputeInput({
  initial,
  onSave
}: {
  initial: number | null
  onSave: (gpuHours: number) => Promise<void>
}): React.JSX.Element {
  const [value, setValue] = useState(initial === null ? '' : String(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await onSave(parsed)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) {
          void save()
        }
      }}
    >
      <label htmlFor="plan-compute" className="text-xs text-muted-foreground">
        Your compute
      </label>
      <Input
        id="plan-compute"
        density="compact"
        inputMode="decimal"
        className="w-24"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Your compute in GPU-hours"
      />
      <span className="text-xs text-muted-foreground">GPU-h</span>
      <Button type="submit" size="xs" variant="outline" disabled={!valid || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  )
}

/** Cumulative must / should / could hours of the kept runs against the person's compute. */
export function ResearchPlanBudget({
  totals,
  readOnly,
  onStateBudget,
  children
}: {
  totals: PlanTierTotals
  readOnly: boolean
  onStateBudget: (gpuHours: number) => Promise<void>
  /** What to cut when the kept runs do not fit (ResearchPlanFit). */
  children?: React.ReactNode
}): React.JSX.Element {
  const { budget } = totals
  const stated = budget.stated && budget.gpuHours !== null
  const scale = Math.max(totals.totalGpuHours, stated ? (budget.gpuHours ?? 0) : 0)
  const over = stated && totals.totalGpuHours > (budget.gpuHours ?? 0) + 1e-9
  let start = 0
  return (
    <PlanSection
      title="Budget"
      hint={
        stated
          ? `Kept runs ${formatHours(totals.totalGpuHours)} of ${formatHours(budget.gpuHours)} GPU-h${budget.derived && budget.gpus !== null ? ` (${formatHours(budget.gpus)} GPUs × ${formatHours(budget.wallclockDays)} days)` : ''}${budget.hardware ? ` on ${budget.hardware}` : ''}.`
          : budget.gpuHours !== null
            ? `The agent assumed ${formatHours(budget.gpuHours)} GPU-h; nobody stated it. State your compute so the cuts can be checked.`
            : 'No compute stated yet. State it, then pick what to keep.'
      }
      action={
        readOnly ? null : (
          <ComputeInput initial={stated ? budget.gpuHours : null} onSave={onStateBudget} />
        )
      }
    >
      <div
        className="relative py-1"
        role="img"
        aria-label={`Kept ${formatHours(totals.totalGpuHours)} GPU-h${stated ? ` of ${formatHours(budget.gpuHours)}` : ''}`}
      >
        <div className="relative h-3 overflow-hidden rounded bg-muted">
          {totals.tiers.map((tier) => {
            const left = percent(start, scale)
            start += tier.gpuHours
            return (
              <div
                key={tier.tier}
                className={cn('absolute inset-y-0', TIER_FILL[tier.tier])}
                style={{ left, width: percent(tier.gpuHours, scale) }}
              />
            )
          })}
        </div>
        {stated ? (
          <div
            className={cn(
              'absolute inset-y-0 w-0.5 rounded-full',
              over ? 'bg-destructive' : 'bg-foreground'
            )}
            style={{ left: `calc(${percent(budget.gpuHours ?? 0, scale)} - 1px)` }}
            title={`Your compute: ${formatHours(budget.gpuHours)} GPU-h`}
          />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {totals.tiers.map((tier) => (
          <span key={tier.tier} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2 rounded-sm', TIER_FILL[tier.tier])} aria-hidden />
            {TIER_LABEL[tier.tier]}
            <span className="tabular-nums text-foreground">{formatHours(tier.gpuHours)}</span>
            <span className="tabular-nums">
              (cumulative {formatHours(tier.cumulativeGpuHours)})
            </span>
            {stated && tier.fits === false ? <span className="text-destructive">over</span> : null}
          </span>
        ))}
        {over ? (
          <span className="text-destructive">
            Over by {formatHours(totals.totalGpuHours - (budget.gpuHours ?? 0))} GPU-h
          </span>
        ) : null}
      </div>
      {children}
    </PlanSection>
  )
}
