import { cn } from '@/lib/utils'
import type { ResearchPlanFinding } from '../../../../shared/research/research-plans'
import { PlanSection } from './ResearchPlanSection'

const SEVERITY = {
  fail: { label: 'Fail', className: 'text-destructive' },
  warn: { label: 'Warn', className: 'text-status-warning' },
  info: { label: 'Info', className: 'text-muted-foreground' }
} as const

/** `plan check` on this revision: the checklist items the plan does not meet yet. */
export function ResearchPlanFindings({
  findings,
  summary
}: {
  findings: readonly ResearchPlanFinding[]
  summary: { fail: number; warn: number; info: number }
}): React.JSX.Element {
  return (
    <PlanSection
      title="Plan check"
      hint={
        findings.length
          ? `${summary.fail} fail, ${summary.warn} warn, ${summary.info} info. Fails block the agent from submitting.`
          : 'No findings on this revision.'
      }
    >
      {findings.length ? (
        <ul className="space-y-2">
          {findings.map((finding) => (
            <li key={finding.id} className="flex gap-3 text-xs">
              <span
                className={cn('w-9 shrink-0 font-medium', SEVERITY[finding.severity].className)}
              >
                {SEVERITY[finding.severity].label}
              </span>
              <div className="min-w-0">
                <span className="font-mono text-2xs text-muted-foreground">{finding.check}</span>
                <p className="text-foreground">{finding.text}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </PlanSection>
  )
}
