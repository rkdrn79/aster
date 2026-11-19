import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  PlanCutConsequences,
  PlanTierTotals
} from '../../../../research-harness/research-plan-view.mjs'
import type { ResearchPlanCell, ResearchPlanTier } from '../../../../shared/research/research-plans'
import {
  cellsByTier,
  formatHours,
  setCellsKept,
  setCutReason,
  tierChecked,
  type PlanSelection
} from './research-plan-view-state'
import { NOTICE_CARD, TAG_CHIP } from './research-surface-classes'
import { PlanSection } from './ResearchPlanSection'

const TIER_TEXT: Record<ResearchPlanTier, { label: string; hint: string }> = {
  must: { label: 'Must', hint: 'claim-critical, and likely reviewer demands' },
  should: { label: 'Should', hint: 'strengthens a claim' },
  could: { label: 'Could', hint: 'nice to have' }
}

function CellRow({
  cell,
  reason,
  readOnly,
  onKeep,
  onReason
}: {
  cell: ResearchPlanCell
  reason: string | undefined
  readOnly: boolean
  onKeep: (kept: boolean) => void
  onReason: (reason: string) => void
}): React.JSX.Element {
  const cut = reason !== undefined
  const id = `plan-cell-${cell.cell}`
  return (
    <li className="py-1.5">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={!cut}
          disabled={readOnly}
          onCheckedChange={(checked) => onKeep(checked === true)}
          aria-label={`Keep ${cell.cell}`}
        />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn('font-mono text-xs', cut && 'text-muted-foreground line-through')}>
              {cell.cell}
            </span>
            <span className="text-2xs text-muted-foreground">
              {cell.purpose}
              {cell.stage ? ` · ${cell.stage}` : ''}
              {cell.seeds > 1 ? ` · ${cell.seeds} seeds` : ''}
            </span>
            {cell.promotedBy.length ? (
              <span className={TAG_CHIP}>
                Likely reviewer demand · {cell.promotedBy.join(', ')}
              </span>
            ) : null}
            {cell.proposed ? <span className={TAG_CHIP}>Proposed</span> : null}
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-2xs',
              cell.priority.score > 0 ? 'text-muted-foreground' : 'text-status-warning'
            )}
            title={cell.expect ?? undefined}
          >
            {cell.priority.score > 0
              ? cell.priority.reasons.join(' · ')
              : 'Supports no claim and answers no reviewer request'}
            {cell.expect ? ` — ${cell.expect}` : ''}
          </span>
        </label>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {cell.cost === null ? 'no cost' : `${formatHours(cell.cost)} h`}
        </span>
      </div>
      {cut ? (
        <div className="mt-1.5 pl-7">
          <Input
            density="compact"
            value={reason}
            readOnly={readOnly}
            onChange={(event) => onReason(event.target.value)}
            placeholder="Why is this out of scope?"
            aria-label={`Out-of-scope reason for ${cell.cell}`}
            aria-invalid={!reason.trim() && !readOnly}
          />
        </div>
      ) : null}
    </li>
  )
}

/** What the current cuts take away; shown while anything is cut. */
function Consequences({
  consequences,
  savedHours
}: {
  consequences: PlanCutConsequences
  savedHours: number
}): React.JSX.Element {
  const likely = consequences.requests.filter((request) => request.likelyDemand)
  const other = consequences.requests.filter((request) => !request.likelyDemand)
  const nothing =
    !consequences.claims.length && !consequences.weakened.length && !consequences.requests.length
  return (
    <div className={cn(NOTICE_CARD, 'mb-4 space-y-2 p-3 text-xs')} aria-live="polite">
      <p className="font-medium">Cutting these saves {formatHours(savedHours)} GPU-h.</p>
      {nothing ? (
        <p className="text-muted-foreground">No claim or reviewer request loses its evidence.</p>
      ) : null}
      {consequences.claims.length ? (
        <div>
          <p className="text-destructive">Claims left with no experiment</p>
          <ul className="mt-1 space-y-0.5">
            {consequences.claims.map((claim) => (
              <li key={claim.id}>
                <span className="font-mono text-muted-foreground">{claim.id}</span> {claim.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {consequences.weakened.length ? (
        <div>
          <p className="text-status-warning">Claims that lose part of their evidence</p>
          <ul className="mt-1 space-y-0.5">
            {consequences.weakened.map((claim) => (
              <li key={claim.id}>
                <span className="font-mono text-muted-foreground">{claim.id}</span> {claim.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {likely.length || other.length ? (
        <div>
          <p className={likely.length ? 'text-destructive' : 'text-status-warning'}>
            Reviewer requests left unanswered
          </p>
          <ul className="mt-1 space-y-0.5">
            {[...likely, ...other].map((request) => (
              <li key={request.id}>
                <span className="font-mono text-muted-foreground">{request.id}</span>{' '}
                {request.request}
                {request.likelyDemand ? (
                  <span className="text-muted-foreground"> · likely demand</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Must / should / could with a checkbox per tier and per run; a cut needs a reason. */
export function ResearchPlanTiers({
  cells,
  selection,
  totals,
  consequences,
  readOnly,
  onChange
}: {
  cells: readonly ResearchPlanCell[]
  selection: PlanSelection
  totals: PlanTierTotals
  consequences: PlanCutConsequences
  readOnly: boolean
  onChange: (next: PlanSelection) => void
}): React.JSX.Element {
  const groups = cellsByTier(cells)
  const savedHours = cells
    .filter((cell) => selection.cuts.has(cell.cell))
    .reduce((sum, cell) => sum + (cell.cost ?? 0), 0)
  return (
    <PlanSection
      title="Tiers"
      hint={
        readOnly
          ? 'Approved. Unchecked runs are out of scope with the reasons shown.'
          : 'Highest priority first in each tier. Uncheck what to leave out; each cut needs a reason and goes into the plan as out of scope.'
      }
    >
      {selection.cuts.size ? (
        <Consequences consequences={consequences} savedHours={savedHours} />
      ) : null}
      <div className="space-y-4">
        {(['must', 'should', 'could'] as const).map((tier) => {
          const own = groups[tier]
          const total = totals.tiers.find((entry) => entry.tier === tier)
          const checked = tierChecked(
            selection,
            own.map((cell) => cell.cell)
          )
          return (
            <div key={tier}>
              <div className="flex items-center gap-3 border-b border-border/60 pb-1.5">
                <Checkbox
                  checked={own.length ? checked : false}
                  disabled={readOnly || !own.length}
                  onCheckedChange={(next) => onChange(setCellsKept(selection, own, next === true))}
                  aria-label={`Keep every ${TIER_TEXT[tier].label.toLowerCase()} run`}
                />
                <span className="text-xs font-medium">{TIER_TEXT[tier].label}</span>
                <span className="text-2xs text-muted-foreground">{TIER_TEXT[tier].hint}</span>
                <span className="ml-auto text-2xs tabular-nums text-muted-foreground">
                  {own.length} {own.length === 1 ? 'run' : 'runs'} · {formatHours(total?.gpuHours)}{' '}
                  GPU-h kept
                  {totals.budget.stated && total?.fits === false ? (
                    <span className="text-destructive"> · over budget</span>
                  ) : null}
                </span>
              </div>
              {own.length ? (
                <ul className="divide-y divide-border/40">
                  {own.map((cell) => (
                    <CellRow
                      key={cell.cell}
                      cell={cell}
                      reason={selection.cuts.get(cell.cell)}
                      readOnly={readOnly}
                      onKeep={(kept) => onChange(setCellsKept(selection, [cell], kept))}
                      onReason={(reason) => onChange(setCutReason(selection, cell.cell, reason))}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-2xs text-muted-foreground">No runs in this tier.</p>
              )}
            </div>
          )
        })}
      </div>
    </PlanSection>
  )
}
