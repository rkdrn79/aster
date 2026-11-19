import { cn } from '@/lib/utils'
import type { PlanCoverage } from '../../../../research-harness/research-plan-view.mjs'
import { TAG_CHIP } from './research-surface-classes'
import { PlanSection } from './ResearchPlanSection'

type ClaimStatus = PlanCoverage['claims'][number]['status']

const STATUS: Record<ClaimStatus, { label: string; className: string }> = {
  covered: { label: 'Covered', className: 'text-muted-foreground' },
  'argued-only': { label: 'Argued only', className: 'text-muted-foreground' },
  'no-experiment': { label: 'No experiment', className: 'text-status-warning' },
  cut: { label: 'Loses evidence', className: 'text-destructive' }
}

function CountCell({
  entry
}: {
  entry: PlanCoverage['claims'][number]['entries'][number] | undefined
}): React.JSX.Element {
  if (!entry) {
    return <span className="text-muted-foreground/50">·</span>
  }
  const kept = entry.included.length
  const planned = entry.cells.length
  if (!planned) {
    return <span className="text-status-warning">0</span>
  }
  return (
    <span
      className={cn('tabular-nums', kept === 0 ? 'text-destructive' : 'text-foreground')}
      title={`${kept} of ${planned} runs kept`}
    >
      {kept === planned ? planned : `${kept}/${planned}`}
    </span>
  )
}

/** Claims as rows, questions (one Experiment each) as columns; a cell counts the kept runs. */
export function ResearchPlanCoverage({ coverage }: { coverage: PlanCoverage }): React.JSX.Element {
  const unmapped = coverage.claims.filter((claim) => claim.status === 'no-experiment').length
  return (
    <PlanSection
      title="Claims and experiments"
      hint={
        unmapped
          ? `${unmapped} main ${unmapped === 1 ? 'claim has' : 'claims have'} no experiment yet.`
          : 'Each number is the runs kept for that claim and question; one question is one Experiment.'
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="pb-2 pr-4 font-medium">
                Claim
              </th>
              {coverage.questions.map((question) => (
                <th
                  key={question.id}
                  scope="col"
                  className="w-16 px-2 pb-2 text-center font-medium"
                  title={question.text}
                >
                  {question.id}
                </th>
              ))}
              <th scope="col" className="pb-2 pl-2 text-right font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {coverage.claims.map((claim) => {
              const status = STATUS[claim.status]
              return (
                <tr key={claim.id} className="align-top">
                  <th
                    scope="row"
                    className="border-t border-border/60 py-2 pr-4 text-left font-normal"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-2xs text-muted-foreground">{claim.id}</span>
                      <span className="line-clamp-2 text-foreground">{claim.text}</span>
                    </div>
                    <div className="mt-1 flex gap-1 pl-6">
                      <span className={TAG_CHIP}>{claim.weight}</span>
                      {claim.kind ? <span className={TAG_CHIP}>{claim.kind}</span> : null}
                    </div>
                  </th>
                  {coverage.questions.map((question) => (
                    <td
                      key={question.id}
                      className="border-t border-border/60 px-2 py-2 text-center"
                    >
                      <CountCell
                        entry={claim.entries.find((entry) => entry.question === question.id)}
                      />
                    </td>
                  ))}
                  <td
                    className={cn(
                      'whitespace-nowrap border-t border-border/60 py-2 pl-2 text-right',
                      status.className
                    )}
                  >
                    {status.label}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {coverage.questions.length ? (
        <ul className="mt-3 space-y-1 text-2xs text-muted-foreground">
          {coverage.questions.map((question) => (
            <li key={question.id} className="flex gap-2">
              <span className="w-6 shrink-0 font-mono">{question.id}</span>
              <span className="min-w-0 truncate" title={question.text}>
                {question.text}
              </span>
              {question.experiment ? (
                <span className="ml-auto shrink-0 font-mono">{question.experiment}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </PlanSection>
  )
}
