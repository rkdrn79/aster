import { useEffect, useRef, useState } from 'react'
import { ChevronRight, MessageSquareText, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { WritingCheckResult } from '../../../../shared/research/research-writing-results'
import {
  findingLocation,
  WRITING_ROLE_LABELS,
  writingCheckChipText,
  writingCheckGroups,
  type WritingCheckGroup,
  type WritingFindingRow,
  type WritingFindingSeverity
} from './research-writing-check-summary'
import type { ResearchWritingCheckState } from './use-research-writing-check'

const SEVERITY_DOT: Record<WritingFindingSeverity, string> = {
  error: 'bg-destructive',
  warning: 'bg-status-warning',
  note: 'bg-muted-foreground/50'
}

const SEVERITY_LABEL: Record<WritingFindingSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  note: 'Note'
}

function FindingRow({
  row,
  onOpen
}: {
  row: WritingFindingRow
  onOpen: (file: string, line: number) => void
}): React.JSX.Element {
  const { finding, severity } = row
  return (
    <li>
      <button
        type="button"
        title="Show in TeX source"
        data-writing-finding={finding.code}
        data-severity={severity}
        className="w-full space-y-1 rounded-lg px-3 py-2 text-left hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => onOpen(finding.file, finding.line)}
      >
        <span className="flex items-center gap-2">
          <span
            aria-label={SEVERITY_LABEL[severity]}
            className={cn('size-1.5 shrink-0 rounded-full', SEVERITY_DOT[severity])}
          />
          <span className="font-mono text-3xs text-muted-foreground">{finding.code}</span>
          <span className="ml-auto truncate font-mono text-3xs text-muted-foreground tabular-nums">
            {findingLocation(finding)}
          </span>
        </span>
        <p className="text-xs leading-snug">
          {/* Why: most messages already quote their span; repeat it only when they do not. */}
          {finding.span && !finding.message.includes(finding.span) ? (
            <span className="font-mono">“{finding.span}” </span>
          ) : null}
          {finding.message}
        </p>
        {finding.fix ? (
          <p className="text-xs leading-snug text-muted-foreground">{finding.fix}</p>
        ) : null}
      </button>
    </li>
  )
}

function SectionGroup({
  group,
  onOpen
}: {
  group: WritingCheckGroup
  onOpen: (file: string, line: number) => void
}): React.JSX.Element {
  const { counts } = group
  return (
    <section aria-label={group.title} className="space-y-1">
      <div className="flex items-baseline gap-2 px-3 pt-1">
        <h3 className="min-w-0 truncate text-xs font-medium">{group.title}</h3>
        {group.title !== WRITING_ROLE_LABELS[group.role] ? (
          <span className="text-2xs text-muted-foreground">{WRITING_ROLE_LABELS[group.role]}</span>
        ) : null}
        <span className="ml-auto text-2xs text-muted-foreground tabular-nums">
          {[
            counts.errors ? `${counts.errors} errors` : null,
            counts.warnings ? `${counts.warnings} warnings` : null
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {group.findings.length ? (
        <ul className="space-y-0.5">
          {group.findings.map((row) => (
            <FindingRow key={row.key} row={row} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
      {group.notes.length ? (
        <Collapsible>
          <CollapsibleTrigger variant="row">
            <span className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
              <ChevronRight
                aria-hidden
                className="size-4 transition-transform group-data-[state=open]:rotate-90"
              />
              {group.notes.length} notes
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="space-y-0.5 pt-1">
              {group.notes.map((row) => (
                <FindingRow key={row.key} row={row} onOpen={onOpen} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  )
}

/** `2 errors · 5 warnings` in the Writing header, `Check` before the first check. */
export function ResearchWritingCheckChip({
  result,
  open,
  onToggle
}: {
  result: WritingCheckResult | null
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <Button
      size="xs"
      variant={open ? 'secondary' : 'ghost'}
      className="h-7"
      aria-pressed={open}
      data-writing-check-chip=""
      title="Show or hide the writing check"
      onClick={onToggle}
    >
      {result?.summary.errors ? (
        <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
      ) : result?.summary.warnings ? (
        <span aria-hidden className="size-1.5 rounded-full bg-status-warning" />
      ) : null}
      {writingCheckChipText(result)}
    </Button>
  )
}

/** The manuscript's writing check, in the drawer beside the Writing panes like Claims. */
export function ResearchWritingCheckPanel({
  check,
  onOpenSource,
  onClose,
  onAskAgent,
  className
}: {
  check: ResearchWritingCheckState
  onOpenSource: (file: string, line: number) => void
  onClose: () => void
  /** Sends the errors and warnings to the Writing agent; resolves to an error or null. */
  onAskAgent?: (result: WritingCheckResult) => Promise<string | null>
  className?: string
}): React.JSX.Element {
  const { result } = check
  const panelRef = useRef<HTMLElement>(null)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      // Why: Escape in the TeX editor or a dialog belongs to them unless focus is in the drawer.
      if (
        target?.closest('.monaco-editor, [role="dialog"], input, textarea') &&
        !panelRef.current?.contains(target)
      ) {
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  const groups = result ? writingCheckGroups(result) : []
  const actionable = result ? result.summary.errors + result.summary.warnings : 0

  async function ask(): Promise<void> {
    if (!result || !onAskAgent) {
      return
    }
    setAsking(true)
    setAskError(await onAskAgent(result))
    setAsking(false)
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Writing check"
      data-writing-check-panel=""
      className={cn(
        'research-panel-in-right flex min-h-0 min-w-0 flex-col bg-background text-foreground',
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium">Writing check</h2>
        {check.available ? (
          <Button size="xs" variant="ghost" disabled={check.checking} onClick={check.recheck}>
            <RefreshCw aria-hidden className={cn(check.checking && 'animate-spin')} />
            Re-check
          </Button>
        ) : null}
        <Button size="icon-xs" variant="ghost" aria-label="Close writing check" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 space-y-3 overflow-auto p-2">
        {!check.available ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            The writing check runs on local projects only
          </p>
        ) : null}
        {check.error ? (
          <p role="alert" className="px-3 py-2 text-xs text-destructive">
            {check.error}
          </p>
        ) : null}
        {!result && check.checking ? (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            Checking the manuscript…
          </p>
        ) : null}
        {result ? (
          <div className="space-y-2 px-3 pt-1">
            <p className="text-xs text-muted-foreground tabular-nums" data-writing-check-summary="">
              {result.summary.errors} errors · {result.summary.warnings} warnings ·{' '}
              {result.summary.notes} notes
            </p>
            {onAskAgent && actionable ? (
              <div className="space-y-1">
                <Button size="xs" variant="outline" disabled={asking} onClick={() => void ask()}>
                  <MessageSquareText aria-hidden />
                  {asking ? 'Sending…' : 'Ask Writing agent to fix'}
                </Button>
                {askError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {askError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {result && groups.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No findings in the manuscript</p>
        ) : null}
        {groups.map((group) => (
          <SectionGroup key={group.key} group={group} onOpen={onOpenSource} />
        ))}
      </div>
    </aside>
  )
}
