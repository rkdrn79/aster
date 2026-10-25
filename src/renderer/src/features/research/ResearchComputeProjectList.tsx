import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ResearchComputeProjectUsage } from './research-compute-usage'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { ResearchGpuProcessTable } from './ResearchGpuProcessTable'
import { ResearchSlurmJobTable, type ResearchSlurmJobActions } from './ResearchSlurmJobTable'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function usageSummary(usage: ResearchComputeProjectUsage): string {
  const parts: string[] = []
  if (usage.runningJobs) {
    parts.push(`${usage.runningJobs} running · ${plural(usage.runningGpus, 'GPU', 'GPUs')}`)
  }
  if (usage.pendingJobs) {
    parts.push(
      `${usage.pendingJobs} pending${usage.pendingGpus ? ` · ${plural(usage.pendingGpus, 'GPU', 'GPUs')} requested` : ''}`
    )
  }
  const otherJobs = usage.jobs.length - usage.runningJobs - usage.pendingJobs
  if (otherJobs) {
    parts.push(`${otherJobs} other`)
  }
  if (usage.processes.length) {
    parts.push(
      `${plural(usage.processes.length, 'GPU process', 'GPU processes')} on ${plural(usage.processGpus, 'GPU', 'GPUs')}`
    )
  }
  return parts.join(' · ')
}

export function ResearchComputeProjectList({
  usages,
  jobActions,
  budgetNotes
}: {
  usages: readonly ResearchComputeProjectUsage[]
  jobActions: ResearchSlurmJobActions
  /** Per project key, e.g. `my-cluster 2/4 GPUs · high`, where it has GPU limits. */
  budgetNotes: ReadonlyMap<string, string[]>
}): React.JSX.Element {
  const [showOtherWork, setShowOtherWork] = useState(false)
  // Why: Compute follows the projects open in Aster; work elsewhere stays one click away.
  const other = usages.find((usage) => usage.projectKey === null)
  const otherCount = (other?.jobs.length ?? 0) + (other?.processes.length ?? 0)
  const visible = usages.filter((usage) => usage.projectKey !== null || showOtherWork)
  return (
    <div className="space-y-4">
      {visible.some((usage) => usage.projectKey !== null) ? null : (
        <p className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
          No jobs or GPU processes in your open projects.
        </p>
      )}
      {otherCount ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {otherCount} {otherCount === 1 ? 'job' : 'jobs'} on these hosts{' '}
          {otherCount === 1 ? 'is' : 'are'} outside your open projects.
          <Button variant="ghost" size="xs" onClick={() => setShowOtherWork(!showOtherWork)}>
            {showOtherWork ? 'Hide' : 'Show'}
          </Button>
        </p>
      ) : null}
      {visible.map((usage) => (
        <section
          key={usage.projectKey ?? 'unmatched'}
          className="overflow-hidden rounded-lg border border-border bg-card"
          aria-label={usage.projectName ?? 'Work outside your open projects'}
        >
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <ResearchComputeProjectDot color={usage.badgeColor} />
              <h2 className="truncate text-sm font-medium">
                {usage.projectName ?? 'Outside your open projects'}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">{usageSummary(usage)}</p>
            {usage.projectKey && budgetNotes.get(usage.projectKey)?.length ? (
              <p className="text-xs text-muted-foreground">
                Limits: {budgetNotes.get(usage.projectKey)?.join(' · ')}
              </p>
            ) : null}
            {usage.projectKey === null ? (
              <p className="w-full text-xs text-muted-foreground">
                The WorkDir, batch script or process directory is in no open project&apos;s folder
                on that host. Choose Link folder to file a job under one of your open projects.
              </p>
            ) : null}
          </header>
          {usage.jobs.length ? (
            <ResearchSlurmJobTable entries={usage.jobs} actions={jobActions} />
          ) : null}
          {usage.processes.length ? (
            <div className={usage.jobs.length ? 'border-t border-border' : undefined}>
              {usage.jobs.length ? (
                <p className="px-4 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  GPU processes (nvidia-smi)
                </p>
              ) : null}
              <ResearchGpuProcessTable entries={usage.processes} />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}
