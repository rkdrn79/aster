import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { FINDING_SEVERITY_DOT, worstFindingSeverity } from './research-findings-format'

/** Count of a Run's open warn/fail findings, dotted with the worst severity; nothing when none. */
export function ResearchRunFindingBadge({
  findings: openFindings
}: {
  findings: ResearchFinding[]
}): React.JSX.Element | null {
  // Why: info findings (e.g. commit unknown) apply to most Runs and would badge every row.
  const findings = openFindings.filter((finding) => finding.severity !== 'info')
  const worst = worstFindingSeverity(findings)
  if (!worst) {
    return null
  }
  const checks = [...new Set(findings.map((finding) => finding.check))].join(', ')
  const label = `${findings.length} open ${findings.length === 1 ? 'finding' : 'findings'}: ${checks}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className="ml-1 inline-flex shrink-0 items-center gap-1 text-3xs tabular-nums text-muted-foreground"
        >
          <span aria-hidden className={cn('size-1.5 rounded-full', FINDING_SEVERITY_DOT[worst])} />
          {findings.length}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
