import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type {
  ResearchComputeHostInput,
  ResearchComputeProcessEntry
} from './research-compute-usage'
import { ResearchGpuBoard } from './ResearchGpuBoard'
import { ResearchSlurmClusterPanel } from './ResearchSlurmClusterPanel'

/** Per-host partitions, nodes and GPUs, folded below the overview so the page stays one view. */
export function ResearchComputeClusterView({
  readings,
  processes,
  gpuSelection,
  onGpuSelectionChange
}: {
  /** One probe reading per host the user picked to read, not every configured host. */
  readings: readonly ResearchComputeHostInput[]
  processes: readonly ResearchComputeProcessEntry[]
  gpuSelection: Readonly<Record<string, readonly number[]>>
  onGpuSelectionChange: (targetId: string, indices: number[]) => void
}): React.JSX.Element | null {
  if (!readings.length) {
    return null
  }
  return (
    <Collapsible>
      <CollapsibleTrigger variant="row">
        <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          <ChevronRight
            aria-hidden
            className="size-3.5 transition-transform group-data-[state=open]:rotate-90"
          />
          Partitions, nodes and GPUs
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-8 pt-3">
          {readings.map(({ targetId, hostLabel, sample }) => (
            <section key={targetId} className="space-y-3" aria-label={`${hostLabel} compute`}>
              <header>
                <h2 className="text-sm font-medium">{hostLabel}</h2>
                <p className="text-xs text-muted-foreground">
                  {[
                    sample.slurm.version,
                    sample.remoteUser ? `signed in as ${sample.remoteUser}` : null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </header>
              {sample.slurm.status !== 'missing' ? (
                <ResearchSlurmClusterPanel sample={sample} />
              ) : null}
              {sample.gpu.status === 'ok' ? (
                <ResearchGpuBoard
                  devices={sample.gpu.devices}
                  entries={processes.filter((entry) => entry.targetId === targetId)}
                  selected={gpuSelection[targetId] ?? []}
                  onSelectedChange={(indices) => onGpuSelectionChange(targetId, indices)}
                />
              ) : sample.gpu.status === 'error' && sample.slurm.status === 'ok' ? (
                <p
                  className="text-xs text-muted-foreground"
                  title={sample.gpu.message ?? undefined}
                >
                  nvidia-smi is not usable on this login node; GPU counts above come from SLURM.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
