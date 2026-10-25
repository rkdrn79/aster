import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ResearchComputeSample } from '../../../../shared/research/research-compute-probe'
import { isSlurmNodeSchedulable, summarizeSlurmPartitions } from './research-slurm-summary'
import { ResearchGpuFillBar } from './ResearchGpuFillBar'

export function ResearchSlurmClusterPanel({
  sample
}: {
  sample: ResearchComputeSample
}): React.JSX.Element {
  const partitions = summarizeSlurmPartitions(sample)
  const nodes = sample.slurm.nodes
  return (
    <div className="space-y-3">
      <div className="scrollbar-sleek overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="text-2xs uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-semibold">Partition</th>
              <th className="min-w-40 px-2 py-2 font-semibold">GPUs allocated</th>
              <th
                className="px-2 py-2 text-right font-semibold"
                title="Total minus allocated GPUs on nodes accepting jobs. Partition limits and QOS can still hold a job."
              >
                Unallocated
              </th>
              <th className="px-2 py-2 text-right font-semibold">Nodes ready</th>
              <th className="px-2 py-2 text-right font-semibold">Running</th>
              <th className="px-2 py-2 text-right font-semibold">Pending</th>
              <th className="px-2 py-2 text-right font-semibold">Yours R / PD</th>
              <th className="px-4 py-2 font-semibold">Top GPU users</th>
            </tr>
          </thead>
          <tbody>
            {partitions.map((partition) => (
              <tr
                key={partition.partition}
                className="border-b border-border last:border-b-0 hover:bg-accent/50"
              >
                <td className="px-4 py-2">
                  <span className="block font-medium">{partition.partition}</span>
                  <span className="block text-muted-foreground">
                    {partition.gpuTypes.join(', ') || 'No GPUs'}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <ResearchGpuFillBar
                      className="w-24"
                      used={partition.gpuAllocated}
                      total={partition.gpuTotal}
                      label={`${partition.partition}: ${partition.gpuAllocated} of ${partition.gpuTotal} GPUs allocated`}
                    />
                    <span className="tabular-nums">
                      {partition.gpuAllocated} / {partition.gpuTotal}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-medium tabular-nums">
                  {partition.gpuUnallocated}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {partition.schedulableNodeCount} / {partition.nodeCount}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{partition.runningJobs}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {partition.pendingJobs}
                  {partition.pendingGpus ? (
                    <span className="text-muted-foreground">
                      {' '}
                      · {partition.pendingGpus} {partition.pendingGpus === 1 ? 'GPU' : 'GPUs'}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {partition.mine.running} / {partition.mine.pending}
                </td>
                <td className="max-w-56 truncate px-4 py-2 text-muted-foreground">
                  {partition.topGpuUsers.map(({ user, gpus }) => `${user} ${gpus}`).join(' · ') ||
                    '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sample.slurm.queueTruncated ? (
        <p className="text-xs text-muted-foreground">
          Large queue: counts cover only the first part of it.
        </p>
      ) : null}
      {nodes.length ? (
        <Collapsible>
          <CollapsibleTrigger variant="row">
            <span className="flex items-center gap-1.5">
              <ChevronRight
                aria-hidden
                className="size-3.5 transition-transform group-data-[state=open]:rotate-90"
              />
              Nodes ({new Set(nodes.map((node) => node.name)).size})
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="scrollbar-sleek overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-semibold">Node</th>
                    <th className="px-2 py-2 font-semibold">Partition</th>
                    <th className="px-2 py-2 font-semibold">State</th>
                    <th className="px-2 py-2 font-semibold">GPU type</th>
                    <th className="px-4 py-2 text-right font-semibold">GPUs allocated</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr
                      key={`${node.name}:${node.partition}`}
                      className={cn(
                        'border-b border-border last:border-b-0',
                        !isSlurmNodeSchedulable(node.state) && 'text-muted-foreground'
                      )}
                    >
                      <td className="px-4 py-1.5 font-mono">{node.name}</td>
                      <td className="px-2 py-1.5">{node.partition}</td>
                      <td className="px-2 py-1.5 font-mono">{node.state}</td>
                      <td className="px-2 py-1.5">{node.gpuTypes.join(', ') || '—'}</td>
                      <td className="px-4 py-1.5">
                        <div className="flex items-center justify-end gap-2 tabular-nums">
                          <ResearchGpuFillBar
                            className="w-24"
                            used={node.gpuUsed}
                            total={node.gpuTotal}
                            unavailable={!isSlurmNodeSchedulable(node.state)}
                            label={`${node.name}: ${node.gpuUsed} of ${node.gpuTotal} GPUs allocated`}
                          />
                          {/* Why fixed width: "8 / 8" and "10 / 10" must not shift the bars out of line. */}
                          <span className="w-14 text-right">
                            {node.gpuUsed} / {node.gpuTotal}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
