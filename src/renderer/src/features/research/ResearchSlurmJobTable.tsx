import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ResearchComputeJobEntry } from './research-compute-usage'
import { isPendingSlurmState, isRunningSlurmState } from './research-compute-usage'
import { formatSlurmTimestamp } from './research-compute-format'
import { isAsterHeldJob } from '../../../../shared/research/research-gpu-budget'
import { slurmPendingReasonHint } from './research-slurm-summary'

const ASTER_HELD_HINT = {
  text: 'Held until your GPU limits have room',
  blocking: false
}

function SlurmStateBadge({
  state,
  blocking
}: {
  state: string
  blocking: boolean
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full bg-muted-foreground/40',
          isRunningSlurmState(state) && 'bg-status-success',
          isPendingSlurmState(state) && blocking && 'bg-status-warning'
        )}
      />
      {state}
    </span>
  )
}

/** An absent action is hidden, e.g. when this window's preload predates it. */
export type ResearchSlurmJobActions = {
  onCancel?: (entry: ResearchComputeJobEntry) => void
  /** Offered on rows no project accounts for. */
  onLinkFolder?: (entry: ResearchComputeJobEntry) => void
}

export function ResearchSlurmJobTable({
  entries,
  actions
}: {
  entries: readonly ResearchComputeJobEntry[]
  actions: ResearchSlurmJobActions
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-2xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 font-semibold">Host</th>
            <th className="px-2 py-2 font-semibold">Job</th>
            <th className="px-2 py-2 font-semibold">State</th>
            <th className="px-2 py-2 text-right font-semibold">GPUs</th>
            <th className="px-2 py-2 font-semibold">Partition</th>
            <th className="px-2 py-2 font-semibold">Nodes / reason</th>
            <th className="px-2 py-2 text-right font-semibold">Time</th>
            <th className="px-2 py-2 font-semibold">Start</th>
            <th className="px-2 py-2 font-semibold">Workspace</th>
            <th className="px-4 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const { targetId, hostLabel, job, attribution } = entry
            const pending = isPendingSlurmState(job.state)
            const hint = !pending
              ? null
              : isAsterHeldJob(job)
                ? ASTER_HELD_HINT
                : slurmPendingReasonHint(job.reason)
            return (
              <tr
                key={`${targetId}:${job.jobId}`}
                className="border-b border-border align-top last:border-b-0 hover:bg-accent/50"
              >
                <td className="max-w-32 truncate px-4 py-2">{hostLabel}</td>
                <td className="max-w-56 px-2 py-2">
                  <span className="block font-mono">{job.jobId}</span>
                  <span className="block truncate text-muted-foreground" title={job.name}>
                    {job.name}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <SlurmStateBadge state={job.state} blocking={hint?.blocking ?? false} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{job.gpuCount}</td>
                <td className="max-w-28 truncate px-2 py-2" title={job.partition}>
                  {job.partition}
                </td>
                <td className="max-w-64 px-2 py-2">
                  {pending ? (
                    <>
                      <span className="block font-mono">{job.reason ?? '—'}</span>
                      {hint ? (
                        <span
                          className={cn(
                            'block text-muted-foreground',
                            hint.blocking && 'text-status-warning'
                          )}
                        >
                          {hint.text}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="block truncate font-mono" title={job.nodes ?? undefined}>
                      {job.nodes ?? '—'}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {job.timeUsed ?? '—'}
                  <span className="text-muted-foreground"> / {job.timeLimit ?? '—'}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                  {pending && job.startTime ? (
                    <span title="Scheduler estimate">
                      est. {formatSlurmTimestamp(job.startTime)}
                    </span>
                  ) : (
                    formatSlurmTimestamp(pending ? null : job.startTime)
                  )}
                </td>
                <td className="max-w-56 px-2 py-2">
                  {attribution ? (
                    <span
                      className="block truncate"
                      title={`${attribution.workspace.path}${
                        attribution.matchedBy === 'command'
                          ? ' · matched by the batch script path'
                          : ''
                      }`}
                    >
                      {attribution.workspace.workspaceName}
                    </span>
                  ) : (
                    <span
                      className="block truncate font-mono text-muted-foreground"
                      title={job.workDir ?? undefined}
                    >
                      {job.workDir ?? '—'}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-1.5 text-right">
                  {actions.onLinkFolder && !attribution && job.workDir ? (
                    <Button variant="ghost" size="xs" onClick={() => actions.onLinkFolder?.(entry)}>
                      Link folder
                    </Button>
                  ) : null}
                  {actions.onCancel && job.state !== 'CG' ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Cancel job ${job.jobId}`}
                      onClick={() => actions.onCancel?.(entry)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
