import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { ResearchPlanRequest } from '../../../../shared/research/research-plans'
import { decideRequest, formatHours, type PlanSelection } from './research-plan-view-state'
import { INSET_WELL, TAG_CHIP } from './research-surface-classes'
import { PlanSection } from './ResearchPlanSection'

// Mirrors PREMORTEM_REVIEWERS in research-plan-reviewers.mjs; an unknown ID shows as itself.
const REVIEWERS: Record<string, string> = {
  R1: 'Closest-prior expert',
  R2: 'Breadth and practicality',
  R3: 'Evidence and mechanism'
}

function AskDecision({
  request,
  selection,
  readOnly,
  onChange
}: {
  request: ResearchPlanRequest
  selection: PlanSelection
  readOnly: boolean
  onChange: (next: PlanSelection) => void
}): React.JSX.Element {
  const decision = selection.decisions.get(request.id)
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-status-warning">
          Your call
          {request.costGpuHours !== null
            ? ` · about ${formatHours(request.costGpuHours)} GPU-h`
            : ''}
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="xs"
          value={decision?.decision ?? ''}
          disabled={readOnly}
          aria-label={`Decide ${request.id}`}
          onValueChange={(value) => {
            if (value === 'include' || value === 'out-of-scope') {
              onChange(
                decideRequest(selection, request, {
                  decision: value,
                  reason: decision?.reason ?? request.reason ?? ''
                })
              )
            }
          }}
        >
          <ToggleGroupItem value="include">Include</ToggleGroupItem>
          <ToggleGroupItem value="out-of-scope">Leave out</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {decision?.decision === 'out-of-scope' ? (
        <Input
          density="compact"
          value={decision.reason}
          readOnly={readOnly}
          placeholder="Why leave it out? It goes into the plan as out of scope."
          aria-label={`Reason for leaving out ${request.id}`}
          aria-invalid={!decision.reason.trim() && !readOnly}
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
}

function Resolution({ request }: { request: ResearchPlanRequest }): React.JSX.Element {
  if (request.resolution === 'plan') {
    return (
      <p className="mt-1.5 text-2xs text-muted-foreground">
        In the plan:{' '}
        <span className="font-mono text-foreground">{request.items.join(', ') || '—'}</span>
      </p>
    )
  }
  if (request.resolution === 'out-of-scope') {
    return (
      <p className="mt-1.5 text-2xs text-muted-foreground">
        Out of scope: <span className="text-foreground">{request.reason ?? 'no reason given'}</span>
      </p>
    )
  }
  return <p className="mt-1.5 text-2xs text-status-warning">Not resolved by the agent yet.</p>
}

function RequestItem({
  request,
  selection,
  readOnly,
  onChange
}: {
  request: ResearchPlanRequest
  selection: PlanSelection
  readOnly: boolean
  onChange: (next: PlanSelection) => void
}): React.JSX.Element {
  return (
    <li className={cn(INSET_WELL, 'p-3')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-2xs text-muted-foreground">{request.id}</span>
        <span className={TAG_CHIP}>
          {request.categoryLabel}
          {request.categoryRate !== null ? ` · asked in ${request.categoryRate}% of papers` : ''}
        </span>
        {request.likelihood ? (
          <span className={cn(TAG_CHIP, request.likelyDemand && 'text-foreground')}>
            {request.likelihood} likelihood
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-foreground">{request.request}</p>
      {request.why ? <p className="mt-0.5 text-2xs text-muted-foreground">{request.why}</p> : null}
      {request.resolution === 'ask' ? (
        <>
          {request.reason ? (
            <p className="mt-1.5 text-2xs text-muted-foreground">Agent: {request.reason}</p>
          ) : null}
          <AskDecision
            request={request}
            selection={selection}
            readOnly={readOnly}
            onChange={onChange}
          />
        </>
      ) : (
        <Resolution request={request} />
      )}
    </li>
  )
}

/** What simulated reviewers would demand, by reviewer, with how each request is answered. */
export function ResearchPlanPremortem({
  requests,
  selection,
  readOnly,
  onChange
}: {
  requests: readonly ResearchPlanRequest[]
  selection: PlanSelection
  readOnly: boolean
  onChange: (next: PlanSelection) => void
}): React.JSX.Element {
  const reviewers = [...new Set(requests.map((request) => request.reviewer ?? 'Other'))]
  const asks = requests.filter((request) => request.resolution === 'ask').length
  return (
    <PlanSection
      title="Reviewer pre-mortem"
      hint={
        requests.length
          ? `${requests.length} requests from simulated reviewers${asks ? `; ${asks} left for you to decide` : ''}.`
          : 'The agent has not run the simulated reviewers yet.'
      }
    >
      <div className="space-y-4">
        {reviewers.map((reviewer) => (
          <div key={reviewer}>
            <h3 className="mb-2 text-xs text-muted-foreground">
              <span className="font-mono">{reviewer}</span>
              {REVIEWERS[reviewer] ? ` · ${REVIEWERS[reviewer]}` : ''}
            </h3>
            <ul className="grid items-start gap-2 md:grid-cols-2">
              {requests
                .filter((request) => (request.reviewer ?? 'Other') === reviewer)
                .map((request) => (
                  <RequestItem
                    key={request.id}
                    request={request}
                    selection={selection}
                    readOnly={readOnly}
                    onChange={onChange}
                  />
                ))}
            </ul>
          </div>
        ))}
      </div>
    </PlanSection>
  )
}
