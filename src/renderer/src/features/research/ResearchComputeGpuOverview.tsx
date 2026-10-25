import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ResearchGpuHostBudget } from '../../../../shared/research/research-gpu-budget'
import type { ResearchGpuPolicy } from '../../../../shared/research/research-gpu-policy'
import type { ResearchComputeHostInput } from './research-compute-usage'
import { ResearchGpuLimitsDialog } from './ResearchGpuLimitsDialog'
import { summarizeSlurmHost, type ResearchSlurmHostSummary } from './research-slurm-summary'
import { ResearchGpuFillBar } from './ResearchGpuFillBar'

type OverviewCard = {
  targetId: string
  hostLabel: string
  source: string
  allocated: number
  total: number
  lines: string[]
  nodes: ResearchSlurmHostSummary['nodes']
  slurm: boolean
}

function overviewCard({
  targetId,
  hostLabel,
  sample
}: ResearchComputeHostInput): OverviewCard | null {
  if (sample.slurm.status !== 'missing' && sample.slurm.nodes.length) {
    const summary = summarizeSlurmHost(sample)
    return {
      targetId,
      hostLabel,
      source: `SLURM · ${summary.schedulableNodeCount} of ${summary.nodeCount} nodes ready`,
      allocated: summary.gpuAllocated,
      total: summary.gpuTotal,
      lines: [
        `${summary.gpuUnallocated} unallocated on ready nodes · ${summary.runningJobs} running · ${summary.pendingJobs} pending${
          summary.pendingGpus ? ` (${summary.pendingGpus} GPUs requested)` : ''
        }`,
        summary.byGpuType
          .map((entry) => `${entry.type} ${entry.allocated}/${entry.total}`)
          .join(' · ')
      ].filter(Boolean),
      nodes: summary.nodes,
      slurm: true
    }
  }
  if (sample.gpu.status === 'ok' && sample.gpu.devices.length) {
    // Why "with processes": nvidia-smi knows usage, not scheduler allocation.
    const busy = new Set(sample.gpu.processes.map((process) => process.gpuUuid)).size
    return {
      targetId,
      hostLabel,
      source: 'nvidia-smi',
      allocated: busy,
      total: sample.gpu.devices.length,
      lines: [`${sample.gpu.devices.length - busy} with no compute process observed`],
      nodes: [],
      slurm: false
    }
  }
  return null
}

/** Each picked host's GPUs at a glance, above the project list. */
function BudgetRow({
  budget,
  hostLabel,
  onEdit
}: {
  budget: ResearchGpuHostBudget | undefined
  hostLabel: string
  onEdit: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-1.5 text-xs">
      {budget ? (
        <>
          <span className="shrink-0 font-medium">Your budget</span>
          <ResearchGpuFillBar
            className="flex-1"
            used={Math.min(budget.usedGpus, budget.maxGpus)}
            total={budget.maxGpus}
            label={`${hostLabel}: ${budget.usedGpus} of your ${budget.maxGpus} GPUs`}
          />
          <span className="shrink-0 tabular-nums">
            {budget.usedGpus} / {budget.maxGpus}
            {budget.held.length ? ` · ${budget.held.length} held` : ''}
          </span>
        </>
      ) : (
        <span className="flex-1 text-muted-foreground">No GPU limits set for you here</span>
      )}
      <Button variant="ghost" size="xs" onClick={onEdit}>
        {budget ? 'Edit limits' : 'Set limits'}
      </Button>
    </div>
  )
}

export function ResearchComputeGpuOverview({
  readings,
  budgets,
  policy,
  onSavePolicy
}: {
  readings: readonly ResearchComputeHostInput[]
  budgets: ReadonlyMap<string, ResearchGpuHostBudget>
  policy: ResearchGpuPolicy
  /** Absent when this window's preload cannot store GPU limits. */
  onSavePolicy?: (next: ResearchGpuPolicy) => Promise<void>
}): React.JSX.Element | null {
  const [limitsTargetId, setLimitsTargetId] = useState<string | null>(null)
  const cards = readings.flatMap((reading) => overviewCard(reading) ?? [])
  const limitsReading = readings.find((reading) => reading.targetId === limitsTargetId)
  if (!cards.length) {
    return null
  }
  return (
    <section className="space-y-2" aria-label="GPU allocation">
      <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
        GPU allocation
      </h2>
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.targetId}
            className="space-y-2 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate text-sm font-medium">{card.hostLabel}</h3>
              <span className="shrink-0 text-xs text-muted-foreground">{card.source}</span>
            </div>
            <div className="flex items-center gap-3">
              <ResearchGpuFillBar
                className="flex-1"
                used={card.allocated}
                total={card.total}
                label={`${card.hostLabel}: ${card.allocated} of ${card.total} GPUs in use`}
              />
              <span className="text-sm font-medium tabular-nums">
                {card.allocated} / {card.total} GPUs
              </span>
            </div>
            {card.slurm && onSavePolicy ? (
              <BudgetRow
                budget={budgets.get(card.targetId)}
                hostLabel={card.hostLabel}
                onEdit={() => setLimitsTargetId(card.targetId)}
              />
            ) : null}
            {card.lines.map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))}
            {card.nodes.length ? (
              <ul
                className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-2 text-2xs"
                aria-label={`${card.hostLabel} nodes`}
              >
                {card.nodes.map((node) => (
                  <li
                    key={node.name}
                    className={cn(
                      'flex items-center gap-2',
                      !node.schedulable && 'text-muted-foreground'
                    )}
                    title={`${node.name} · ${node.partition} · ${node.state} · ${node.gpuTypes.join(', ')}`}
                  >
                    <span className="w-12 shrink-0 truncate font-mono">{node.name}</span>
                    <ResearchGpuFillBar
                      className="flex-1"
                      used={node.gpuUsed}
                      total={node.gpuTotal}
                      unavailable={!node.schedulable}
                      label={`${node.name}: ${node.gpuUsed} of ${node.gpuTotal} GPUs allocated${
                        node.schedulable ? '' : `, ${node.state}`
                      }`}
                    />
                    <span className="w-12 shrink-0 truncate text-right tabular-nums">
                      {node.schedulable
                        ? `${node.gpuUsed}/${node.gpuTotal}`
                        : node.state.replace(/[*~#!%$@^+-].*$/, '')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      {onSavePolicy ? (
        <ResearchGpuLimitsDialog
          target={
            limitsReading
              ? {
                  targetId: limitsReading.targetId,
                  hostLabel: limitsReading.hostLabel,
                  projects: [
                    ...new Map(
                      limitsReading.workspaces.map((workspace) => [
                        workspace.projectKey,
                        { projectKey: workspace.projectKey, projectName: workspace.projectName }
                      ])
                    ).values()
                  ]
                }
              : null
          }
          policy={policy}
          onClose={() => setLimitsTargetId(null)}
          onSave={onSavePolicy}
        />
      ) : null}
    </section>
  )
}
