import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { NotebookSeverityMarker } from './ResearchExperimentNotebookLayout'

const SHOWN = 3

/** The selected Run's open warnings and failures, a line each; decisions live in the notebook. */
export function ResearchExperimentWorkspaceRunFindings({
  run,
  findings: openFindings
}: {
  run: ResearchRunRecord
  findings: ResearchFinding[]
}): React.JSX.Element | null {
  // Why: info findings (e.g. commit unknown) apply to most Runs; the notebook lists them all.
  const findings = openFindings.filter((finding) => finding.severity !== 'info')
  if (!findings.length) {
    return null
  }
  const hidden = findings.length - SHOWN
  return (
    <ul aria-label={`Open problems for ${run.name}`} className="space-y-1 text-xs">
      {findings.slice(0, SHOWN).map((finding) => (
        <li key={finding.id} className="flex min-w-0 items-baseline gap-2">
          <span className="flex w-1.5 shrink-0 translate-y-[-1px] items-center">
            <NotebookSeverityMarker severity={finding.severity} />
          </span>
          <span
            className="line-clamp-2 min-w-0 break-words"
            title={`${finding.text} · ${finding.check}`}
          >
            {finding.text}
          </span>
        </li>
      ))}
      {hidden > 0 ? (
        <li className="pl-3.5 text-muted-foreground">{hidden} more in the notebook</li>
      ) : null}
    </ul>
  )
}
