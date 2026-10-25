import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type {
  ResearchFinding,
  ResearchFindingEvidence,
  ResearchFindingSeverity,
  ResearchFindingStatus
} from '../../../../shared/research/research-quality-findings'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { ResearchFindingAgentActions } from './ResearchFindingAgentActions'
import {
  FINDING_SEVERITY_DOT,
  FINDING_SEVERITY_LABELS,
  FINDING_SOURCE_LABELS,
  FINDING_STATUS_LABELS,
  findingEvidenceText
} from './research-findings-format'
import { ResearchFindingStatusAction } from './research-findings-status-action'
import { findingIdentifiers, findingPresentation } from './research-finding-titles'
import { researchRelativeTime } from './research-relative-time'

const OPEN_EDGE: Record<ResearchFindingSeverity, string> = {
  fail: 'border-l-destructive',
  warn: 'border-l-status-warning',
  info: 'border-l-transparent'
}

export function ResearchFindingSeverityLabel({
  severity
}: {
  severity: ResearchFindingSeverity
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5',
        severity === 'info' ? 'text-muted-foreground' : 'font-medium text-foreground'
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', FINDING_SEVERITY_DOT[severity])} />
      {FINDING_SEVERITY_LABELS[severity]}
    </span>
  )
}

function EvidenceItem({
  evidence,
  runName
}: {
  evidence: ResearchFindingEvidence
  runName: (reference: string) => string
}): React.JSX.Element {
  const text = findingEvidenceText(evidence, runName)
  if (evidence.kind !== 'log' || !evidence.excerpt) {
    return (
      <li className={cn('truncate', evidence.kind === 'file' && 'font-mono text-2xs')} title={text}>
        {text}
      </li>
    )
  }
  return (
    <li>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex max-w-full items-center gap-1 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              aria-hidden
              className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
            />
            <span className="truncate">{text}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="scrollbar-sleek mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-2xs text-foreground">
            {evidence.excerpt}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/** One finding: what was found, where the evidence is, and the user's decision. */
export function ResearchFindingRow({
  experiment,
  slug,
  finding,
  runName,
  onChanged
}: {
  experiment: ExperimentRecord
  slug: string
  finding: ResearchFinding
  runName: (reference: string) => string
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const open = finding.status === 'open'
  // Why keyed by content: evidence has no IDs, and an identical repeat adds nothing to show.
  const evidence = [
    ...new Map(
      finding.evidence.flatMap((item) => (item ? [[JSON.stringify(item), item] as const] : []))
    )
  ]
  const decidedBy = finding.statusBy === 'agent' ? 'agent' : 'you'
  const { title, summary } = findingPresentation(finding, runName)
  const actions: ResearchFindingStatus[] = open ? ['accepted', 'dismissed'] : ['open']
  return (
    <li
      className={cn(
        'space-y-1.5 rounded-md border-l-2 px-3 py-2',
        open ? OPEN_EDGE[finding.severity] : 'border-l-transparent'
      )}
    >
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
        title={findingIdentifiers(finding)}
      >
        <ResearchFindingSeverityLabel severity={finding.severity} />
        <span className="text-muted-foreground">{FINDING_SOURCE_LABELS[finding.source]}</span>
        {finding.runs.length ? (
          <span className="min-w-0 truncate text-muted-foreground">
            {finding.runs.map(runName).join(', ')}
          </span>
        ) : null}
        <time
          className="ml-auto shrink-0 text-muted-foreground"
          dateTime={finding.createdAt}
          title={finding.createdAt}
        >
          {finding.source === 'rule' ? 'checked ' : ''}
          {researchRelativeTime(finding.createdAt)}
        </time>
      </div>
      <p className={cn('text-sm', !open && 'text-muted-foreground')}>{title}</p>
      {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
      {evidence.length || finding.samples.length ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label="Evidence">
          {evidence.map(([key, item]) => (
            <EvidenceItem key={key} evidence={item} runName={runName} />
          ))}
          {finding.samples.length ? (
            <li className="truncate" title={finding.samples.join(', ')}>
              Samples {finding.samples.join(', ')}
            </li>
          ) : null}
        </ul>
      ) : null}
      {!open || finding.statusNote ? (
        <p className="text-xs text-muted-foreground">
          {!open ? `${FINDING_STATUS_LABELS[finding.status]} by ${decidedBy}` : 'Reopened'}
          {finding.statusNote ? ` · ${finding.statusNote}` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {actions.map((status) => (
          <ResearchFindingStatusAction
            key={status}
            experiment={experiment}
            slug={slug}
            finding={finding}
            status={status}
            onChanged={onChanged}
          />
        ))}
        <ResearchFindingAgentActions experiment={experiment} finding={finding} />
      </div>
    </li>
  )
}
