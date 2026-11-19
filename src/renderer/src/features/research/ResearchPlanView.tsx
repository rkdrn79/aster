import { useMemo, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { budgetFit } from '../../../../research-harness/research-plan-fit.mjs'
import {
  closestPriorView,
  coverageMatrix,
  cutConsequences,
  runOrder,
  tierTotals
} from '../../../../research-harness/research-plan-view.mjs'
import type {
  ResearchPlanOverview,
  ResearchPlanSummary
} from '../../../../shared/research/research-plans'
import { researchErrorText } from './research-error-text'
import {
  applySuggestedCuts,
  approveBlockers,
  approveInput,
  cutSet,
  formatHours,
  initialSelection,
  planApproved,
  proposedSummary,
  type PlanSelection
} from './research-plan-view-state'
import { NOTICE_CARD, RAISED_CARD, TAG_CHIP } from './research-surface-classes'
import { ResearchEmptyState } from './ResearchPageLayout'
import { ResearchPlanBudget } from './ResearchPlanBudget'
import { ResearchPlanCoverage } from './ResearchPlanCoverage'
import { ResearchPlanFindings } from './ResearchPlanFindings'
import { ResearchPlanFit } from './ResearchPlanFit'
import { ResearchPlanOrder } from './ResearchPlanOrder'
import { ResearchPlanPremortem } from './ResearchPlanPremortem'
import { ResearchPlanPrior } from './ResearchPlanPrior'
import { ResearchPlanTiers } from './ResearchPlanTiers'
import type { ResearchPlanState } from './use-research-plan'

const STATUS_LABEL = {
  draft: 'Draft',
  submitted: 'Waiting for your approval',
  approved: 'Approved',
  closed: 'Closed'
} as const

function PlanHeader({
  overview,
  plans,
  selected,
  onSelect,
  blockers,
  approving,
  onApprove,
  notice
}: {
  overview: ResearchPlanOverview
  plans: readonly ResearchPlanSummary[]
  selected: string
  onSelect: (plan: string) => void
  blockers: readonly string[]
  approving: boolean
  onApprove: () => void
  notice: string | null
}): React.JSX.Element {
  const approved = planApproved(overview)
  const approval = overview.plan.approval
  return (
    <section aria-label="Plan" className={cn(RAISED_CARD, 'p-4')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">{overview.plan.title}</h2>
            <span className={TAG_CHIP}>{STATUS_LABEL[overview.plan.status]}</span>
            <span className="text-2xs tabular-nums text-muted-foreground">
              Revision {overview.plan.revision}
            </span>
          </div>
          {overview.plan.method ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {overview.plan.method}
            </p>
          ) : null}
        </div>
        {plans.length > 1 ? (
          <Select value={selected} onValueChange={onSelect}>
            <SelectTrigger size="sm" className="w-56" aria-label="Plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {approved ? null : (
          <Button size="sm" disabled={blockers.length > 0 || approving} onClick={onApprove}>
            {approving ? 'Approving…' : 'Approve plan'}
          </Button>
        )}
      </div>
      {approved && approval ? (
        <p className="mt-3 text-xs text-muted-foreground">
          You approved revision {approval.revision}: {formatHours(approval.keptGpuHours)} of{' '}
          {formatHours(approval.budgetGpuHours)} GPU-h kept, {approval.cuts.length}{' '}
          {approval.cuts.length === 1 ? 'run' : 'runs'} out of scope. Every Run still waits for your
          approval in its Experiment.
        </p>
      ) : blockers.length ? (
        <ul
          className="mt-3 space-y-0.5 text-xs text-muted-foreground"
          aria-label="Before approving"
        >
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Approving pins this revision and proposes the first stage&apos;s runs. Nothing runs until
          you approve each one.
        </p>
      )}
      {notice ? (
        <p role="status" className={cn(NOTICE_CARD, 'mt-3 px-3 py-2 text-xs')}>
          {notice}
        </p>
      ) : null}
    </section>
  )
}

function PlanBody({
  state,
  overview,
  notice,
  setNotice
}: {
  state: ResearchPlanState
  overview: ResearchPlanOverview
  notice: string | null
  setNotice: (notice: string | null) => void
}): React.JSX.Element {
  const [selection, setSelection] = useState<PlanSelection>(() => initialSelection(overview))
  const [approving, setApproving] = useState(false)
  const approved = planApproved(overview)
  const document = overview.document
  const cut = useMemo(() => cutSet(selection), [selection])
  const totals = useMemo(() => tierTotals(document, cut), [document, cut])
  const coverage = useMemo(() => coverageMatrix(document, cut), [document, cut])
  const order = useMemo(() => runOrder(document, cut), [document, cut])
  const consequences = useMemo(() => cutConsequences(document, cut), [document, cut])
  const fit = useMemo(() => budgetFit(document, cut), [document, cut])
  const closest = useMemo(() => closestPriorView(document), [document])
  const blockers = approved ? [] : approveBlockers(overview, selection, totals)

  async function approve(): Promise<void> {
    setApproving(true)
    try {
      const result = await state.approve(approveInput(overview, selection))
      setNotice(proposedSummary(result.proposals))
    } catch (cause) {
      toast.error(researchErrorText(cause))
    } finally {
      setApproving(false)
    }
  }

  async function proposeStage(stage: string): Promise<void> {
    try {
      const result = await state.proposeStage(stage)
      setNotice(proposedSummary(result.proposals))
    } catch (cause) {
      toast.error(researchErrorText(cause))
    }
  }

  return (
    <div className="space-y-4">
      <PlanHeader
        overview={overview}
        plans={state.plans}
        selected={overview.plan.id}
        onSelect={state.select}
        blockers={blockers}
        approving={approving}
        onApprove={() => void approve()}
        notice={notice}
      />
      <ResearchPlanBudget totals={totals} readOnly={approved} onStateBudget={state.stateBudget}>
        <ResearchPlanFit
          fit={fit}
          readOnly={approved}
          onApply={() => setSelection(applySuggestedCuts(selection, fit.suggestions))}
        />
      </ResearchPlanBudget>
      <ResearchPlanCoverage coverage={coverage} />
      <ResearchPlanPrior entries={closest} />
      <ResearchPlanTiers
        cells={overview.cells}
        selection={selection}
        totals={totals}
        consequences={consequences}
        readOnly={approved}
        onChange={setSelection}
      />
      <ResearchPlanOrder
        order={order}
        cells={overview.cells}
        approved={approved}
        onProposeStage={proposeStage}
      />
      <ResearchPlanPremortem
        requests={overview.premortem.requests}
        selection={selection}
        readOnly={approved}
        onChange={setSelection}
      />
      <ResearchPlanFindings findings={overview.findings} summary={overview.summary} />
    </div>
  )
}

/** The project's experiment plan: coverage, tiers and cuts, budget, order, pre-mortem, checks. */
export function ResearchPlanView({ state }: { state: ResearchPlanState }): React.JSX.Element {
  // Why here: approving remounts the body (new status), and its result must stay on screen.
  const [notice, setNotice] = useState<string | null>(null)
  if (!state.available) {
    return (
      <ResearchEmptyState icon={ListChecks} title="Plans need a newer Aster">
        Update Aster to review experiment plans here.
      </ResearchEmptyState>
    )
  }
  if (state.error && !state.overview) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    )
  }
  if (state.loading && !state.overview) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading the plan…
      </p>
    )
  }
  if (!state.overview) {
    return (
      <ResearchEmptyState icon={ListChecks} title="No experiment plan yet">
        Ask the Experiment agent to plan the experiments for your claims. Its plan shows here for
        you to choose what to keep, check against your compute and approve.
      </ResearchEmptyState>
    )
  }
  const { overview } = state
  // Why the key: a new revision or plan starts from its own approved choices, not stale cuts.
  return (
    <PlanBody
      key={`${overview.plan.id}:${overview.plan.revision}:${overview.plan.status}`}
      state={state}
      overview={overview}
      notice={notice}
      setNotice={setNotice}
    />
  )
}
