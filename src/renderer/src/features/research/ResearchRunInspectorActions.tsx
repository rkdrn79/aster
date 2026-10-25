import { MoreHorizontal, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { RESEARCH_RUN_EXECUTION_STATES } from '../../../../shared/research/research-run-manifest'
import { useResearchRecords } from './research-records-store'
import { attachResearchRunRecord } from './research-run-record-links'
import { researchRunStatusLabel } from './research-run-status-label'

function setRecordedStatus(
  run: ResearchRunRecord,
  execution: (typeof RESEARCH_RUN_EXECUTION_STATES)[number]
): void {
  void useResearchRecords
    .getState()
    .update((current) => ({
      ...current,
      runs: current.runs.map((entry) =>
        entry.id === run.id
          ? { ...entry, execution, reportedBy: 'user', observedAt: new Date().toISOString() }
          : entry
      )
    }))
    .catch(() => undefined)
}

/** Detaching only drops the record, so undo puts the same record back, checked as it was. */
function detachWithUndo(run: ResearchRunRecord, onDetach: (id: string) => void): void {
  const before = useResearchRecords.getState().document
  const wasCompared = before?.comparisonRunIds.includes(run.id) ?? false
  const wasBaseline = before?.baselineRunId === run.id
  onDetach(run.id)
  toast(`Detached ${run.name}`, {
    description: 'Its files are untouched.',
    action: {
      label: 'Undo',
      onClick: () =>
        void useResearchRecords
          .getState()
          .update((current) => {
            if (current.runs.some((entry) => entry.id === run.id)) {
              return current
            }
            const restored = attachResearchRunRecord(current, run)
            const comparisonRunIds =
              wasCompared && !restored.comparisonRunIds.includes(run.id)
                ? [...restored.comparisonRunIds, run.id]
                : restored.comparisonRunIds
            return {
              ...restored,
              comparisonRunIds,
              baselineRunId: wasBaseline ? run.id : restored.baselineRunId
            }
          })
          .catch(() => undefined)
    }
  })
}

/** Set status, Refresh, and the rarer actions behind ⋯ so Detach is never a stray click. */
export function ResearchRunInspectorActions({
  run,
  busy,
  onRefresh,
  onDetach,
  onOpenLog
}: {
  run: ResearchRunRecord
  busy: boolean
  onRefresh: () => void
  onDetach: (id: string) => void
  onOpenLog: (() => void) | null
}): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            Set status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {RESEARCH_RUN_EXECUTION_STATES.map((execution) => (
            <DropdownMenuItem key={execution} onSelect={() => setRecordedStatus(run, execution)}>
              {researchRunStatusLabel(execution)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="outline" disabled={busy} onClick={onRefresh}>
        <RefreshCw aria-hidden />
        Refresh
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="More run actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onOpenLog ? (
            <DropdownMenuItem onSelect={onOpenLog}>Open full log</DropdownMenuItem>
          ) : null}
          {onOpenLog ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => detachWithUndo(run, onDetach)}>
            Detach from experiment
          </DropdownMenuItem>
          <p className="max-w-56 px-2 pb-1.5 text-2xs text-muted-foreground">
            Removes the run from this list; its files are untouched.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
