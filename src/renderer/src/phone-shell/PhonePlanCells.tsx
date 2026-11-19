import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  cellsByTier,
  decideRequest,
  formatHours,
  setCellsKept,
  setCutReason,
  type PlanSelection
} from '@/features/research/research-plan-view-state'
import { cn } from '@/lib/utils'
import type {
  ResearchPlanCell,
  ResearchPlanOverview,
  ResearchPlanTier
} from '../../../shared/research/research-plans'
import { PhoneSection } from './PhoneListLayout'

const TIER_LABELS: Record<ResearchPlanTier, string> = {
  must: 'Must run',
  should: 'Should run',
  could: 'Could run'
}

function CellRow({
  cell,
  selection,
  readOnly,
  onChange
}: {
  cell: ResearchPlanCell
  selection: PlanSelection
  readOnly: boolean
  onChange: (next: PlanSelection) => void
}): React.JSX.Element {
  const cut = selection.cuts.has(cell.cell)
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-base font-medium',
              cut && 'text-muted-foreground line-through'
            )}
          >
            {cell.cell}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {[
              cell.purpose,
              `${formatHours(cell.cost)} GPU-h`,
              cell.seeds > 1 ? `${cell.seeds} seeds` : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Switch
          checked={!cut}
          disabled={readOnly}
          aria-label={`Keep ${cell.cell}`}
          onCheckedChange={(kept) => onChange(setCellsKept(selection, [cell], kept))}
        />
      </div>
      {cut ? (
        <Input
          className="mt-2 h-10"
          value={selection.cuts.get(cell.cell) ?? ''}
          disabled={readOnly}
          aria-label={`Why ${cell.cell} is out of scope`}
          placeholder="Why it is out of scope"
          onChange={(event) => onChange(setCutReason(selection, cell.cell, event.target.value))}
        />
      ) : null}
    </div>
  )
}

/** The plan's cells by tier, each kept or cut with a reason, as the desktop's tiers. */
export function PhonePlanCells({
  overview,
  selection,
  readOnly,
  onChange
}: {
  overview: ResearchPlanOverview
  selection: PlanSelection
  readOnly: boolean
  onChange: (next: PlanSelection) => void
}): React.JSX.Element {
  const tiers = cellsByTier(overview.cells)
  return (
    <>
      {(['must', 'should', 'could'] as const).map((tier) =>
        tiers[tier].length ? (
          <PhoneSection key={tier} label={TIER_LABELS[tier]}>
            {tiers[tier].map((cell) => (
              <CellRow
                key={cell.cell}
                cell={cell}
                selection={selection}
                readOnly={readOnly}
                onChange={onChange}
              />
            ))}
          </PhoneSection>
        ) : null
      )}
    </>
  )
}

/** Reviewer requests the agent left to the person: include them, or leave them out with a reason. */
export function PhonePlanAsks({
  overview,
  selection,
  readOnly,
  onChange
}: {
  overview: ResearchPlanOverview
  selection: PlanSelection
  readOnly: boolean
  onChange: (next: PlanSelection) => void
}): React.JSX.Element | null {
  const asks = overview.premortem.requests.filter((request) =>
    overview.premortem.asks.includes(request.id)
  )
  if (asks.length === 0) {
    return null
  }
  return (
    <PhoneSection label="Reviewer requests left to you">
      {asks.map((request) => {
        const decision = selection.decisions.get(request.id)
        const choose = (choice: 'include' | 'out-of-scope') =>
          onChange(
            decideRequest(selection, request, { decision: choice, reason: decision?.reason ?? '' })
          )
        return (
          <div key={request.id} className="px-4 py-3">
            <p className="text-base leading-snug">{request.request}</p>
            {request.why ? (
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{request.why}</p>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={request.id}>
              {(['include', 'out-of-scope'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={decision?.decision === choice}
                  onClick={() => choose(choice)}
                  className={cn(
                    'h-10 rounded-lg border border-border text-[15px] font-medium active:bg-accent disabled:opacity-50',
                    decision?.decision === choice && 'border-foreground bg-secondary'
                  )}
                >
                  {choice === 'include' ? 'Include' : 'Leave out'}
                </button>
              ))}
            </div>
            {decision?.decision === 'out-of-scope' ? (
              <Input
                className="mt-2 h-10"
                value={decision.reason}
                disabled={readOnly}
                aria-label={`Why ${request.id} is left out`}
                placeholder="Why it is left out"
                onChange={(event) =>
                  onChange(
                    decideRequest(selection, request, {
                      decision: 'out-of-scope',
                      reason: event.target.value
                    })
                  )
                }
              />
            ) : null}
          </div>
        )
      })}
    </PhoneSection>
  )
}
