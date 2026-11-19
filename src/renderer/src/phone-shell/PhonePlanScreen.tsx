import { useState } from 'react'
import { ClipboardList, FileWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatHours, planApproved } from '@/features/research/research-plan-view-state'
import { cn } from '@/lib/utils'
import { HOST_UPDATE_NEEDED_TEXT } from '@/web/web-research-decisions'
import {
  PhoneEmptyState,
  PhoneRow,
  PhoneScrollBody,
  PhoneSection,
  PhoneSectionNote,
  PhoneStatusPill
} from './PhoneListLayout'
import { PhonePlanAsks, PhonePlanCells } from './PhonePlanCells'
import { usePhonePlan, type PhonePlanState } from './use-phone-plan'

/** The person's compute: stated once, then the kept cells are checked against it. */
function ComputeSection({ state }: { state: PhonePlanState }): React.JSX.Element | null {
  const [hours, setHours] = useState('')
  const { totals } = state
  if (!totals) {
    return null
  }
  const over =
    totals.budget.stated &&
    totals.budget.gpuHours !== null &&
    totals.totalGpuHours > totals.budget.gpuHours + 1e-9
  const parsed = Number(hours)
  return (
    <PhoneSection label="Compute">
      <PhoneRow
        title={
          <span className={cn('tabular-nums', over && 'text-destructive')}>
            {`${formatHours(totals.totalGpuHours)} of ${totals.budget.stated ? formatHours(totals.budget.gpuHours) : '?'} GPU-h kept`}
          </span>
        }
        subtitle={
          totals.budget.stated
            ? over
              ? 'Over your compute: cut more, or state more below'
              : 'Fits your compute'
            : 'State your compute before approving'
        }
      />
      <div className="flex items-center gap-2 px-4 py-3">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          placeholder={totals.budget.stated ? 'New GPU-hours' : 'GPU-hours you have'}
          aria-label="Your compute in GPU-hours"
          className="h-10 flex-1"
        />
        <Button
          variant="outline"
          className="h-10"
          disabled={state.busy !== null || !hours.trim() || !Number.isFinite(parsed) || parsed < 0}
          onClick={() => void state.stateBudget(parsed).then(() => setHours(''))}
        >
          {state.busy === 'budget' ? 'Saving…' : 'State'}
        </Button>
      </div>
    </PhoneSection>
  )
}

/** A submitted experiment plan: cut what does not fit, decide the asks, approve the revision. */
export function PhonePlanScreen({
  worktreeId,
  plan
}: {
  worktreeId: string
  plan: string
}): React.JSX.Element {
  const state = usePhonePlan(worktreeId, plan)
  const { overview } = state
  if (state.status === 'update-needed') {
    return (
      <PhoneEmptyState icon={FileWarning} title="Server update needed">
        {HOST_UPDATE_NEEDED_TEXT}
      </PhoneEmptyState>
    )
  }
  if (!overview) {
    return (
      <PhoneEmptyState
        icon={ClipboardList}
        title={state.status === 'loading' ? 'Reading the plan…' : 'Plan could not be read'}
      >
        {state.error}
      </PhoneEmptyState>
    )
  }
  const approvedRevision = planApproved(overview)
  return (
    <PhoneScrollBody>
      <div className="px-8 pt-5">
        <div className="flex items-center gap-2">
          <PhoneStatusPill tone={approvedRevision ? 'success' : 'attention'}>
            {approvedRevision
              ? 'Approved'
              : overview.plan.status === 'submitted'
                ? 'Waiting for you'
                : 'Draft'}
          </PhoneStatusPill>
          <span className="text-[13px] text-muted-foreground">
            {`Revision ${overview.plan.revision} · ${overview.cells.length} runs`}
          </span>
        </div>
        {overview.plan.method ? (
          <p className="mt-2 text-[15px] leading-snug">{overview.plan.method}</p>
        ) : null}
      </div>
      <ComputeSection state={state} />
      <PhonePlanAsks
        overview={overview}
        selection={state.selection}
        readOnly={approvedRevision}
        onChange={state.setSelection}
      />
      <PhonePlanCells
        overview={overview}
        selection={state.selection}
        readOnly={approvedRevision}
        onChange={state.setSelection}
      />
      {approvedRevision ? (
        <PhoneSection>
          <PhoneSectionNote>
            {state.approved ??
              'This revision is approved. Its runs wait for your approval in Needs you.'}
          </PhoneSectionNote>
        </PhoneSection>
      ) : (
        <div className="space-y-2 px-4 pt-5">
          {state.blockers.map((blocker) => (
            <p key={blocker} className="px-4 text-[13px] leading-snug text-muted-foreground">
              {blocker}
            </p>
          ))}
          <Button
            className="h-11 w-full"
            disabled={state.busy !== null || state.blockers.length > 0}
            onClick={() => void state.approve()}
          >
            {state.busy === 'approve' ? 'Approving…' : `Approve revision ${overview.plan.revision}`}
          </Button>
        </div>
      )}
      {state.error ? (
        <p role="alert" className="px-8 pt-3 text-[13px] text-destructive">
          {state.error}
        </p>
      ) : null}
    </PhoneScrollBody>
  )
}
