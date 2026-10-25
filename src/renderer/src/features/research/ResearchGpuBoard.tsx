import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import type { ResearchGpuDevice } from '../../../../shared/research/research-compute-probe'
import type { ResearchComputeProcessEntry } from './research-compute-usage'
import { cudaVisibleDevicesPrefix, formatGpuMemory } from './research-compute-format'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'

function percent(used: number | null, total: number | null): number {
  return used !== null && total ? Math.min(100, (used / total) * 100) : 0
}

function GpuCard({
  device,
  entries,
  selected,
  onSelectedChange
}: {
  device: ResearchGpuDevice
  entries: readonly ResearchComputeProcessEntry[]
  selected: boolean
  onSelectedChange: (selected: boolean) => void
}): React.JSX.Element {
  const checkboxId = `gpu-select-${device.uuid}`
  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-3">
      <header className="flex items-start gap-2">
        <Checkbox
          id={checkboxId}
          className="mt-0.5"
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          aria-label={`Select GPU ${device.index}`}
        />
        <label htmlFor={checkboxId} className="min-w-0 flex-1">
          <span className="block text-sm font-medium">GPU {device.index}</span>
          <span className="block truncate text-xs text-muted-foreground" title={device.name}>
            {device.name || device.uuid}
          </span>
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {device.temperatureC === null ? '' : `${device.temperatureC}°C`}
        </span>
      </header>
      <div className="space-y-2 text-xs">
        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Utilization</span>
            <span className="tabular-nums">
              {device.utilizationPercent === null ? 'N/A' : `${device.utilizationPercent}%`}
            </span>
          </div>
          <Progress
            value={device.utilizationPercent ?? 0}
            aria-label={`GPU ${device.index} utilization`}
          />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Memory</span>
            <span className="tabular-nums">
              {formatGpuMemory(device.memoryUsedMiB)} / {formatGpuMemory(device.memoryTotalMiB)}
            </span>
          </div>
          <Progress
            value={percent(device.memoryUsedMiB, device.memoryTotalMiB)}
            aria-label={`GPU ${device.index} memory`}
          />
        </div>
      </div>
      {entries.length ? (
        <ul className="space-y-1 border-t border-border pt-2 text-xs">
          {entries.map((entry) => (
            <li
              key={entry.process.pid}
              className="flex items-center gap-2"
              title={entry.process.command ?? undefined}
            >
              <ResearchComputeProjectDot color={entry.attribution?.workspace.badgeColor ?? null} />
              <span className="min-w-0 flex-1 truncate">
                {entry.attribution?.workspace.projectName ?? (
                  <span className="text-muted-foreground">Not matched</span>
                )}
              </span>
              <span className="font-mono text-muted-foreground">{entry.process.pid}</span>
              <span className="w-16 text-right tabular-nums text-muted-foreground">
                {formatGpuMemory(entry.process.usedMemoryMiB)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">
          No compute process observed
        </p>
      )}
    </article>
  )
}

async function copyPrefix(indices: readonly number[]): Promise<void> {
  const prefix = cudaVisibleDevicesPrefix(indices)
  try {
    await navigator.clipboard.writeText(prefix)
    toast.success(`Copied ${prefix}`)
  } catch (cause) {
    toast.error(`Copy failed: ${String(cause)}`)
  }
}

/** nvidia-smi view of one host: GPU cards, the PIDs on each, and a CUDA_VISIBLE_DEVICES copy. */
export function ResearchGpuBoard({
  devices,
  entries,
  selected,
  onSelectedChange
}: {
  devices: readonly ResearchGpuDevice[]
  entries: readonly ResearchComputeProcessEntry[]
  selected: readonly number[]
  onSelectedChange: (indices: number[]) => void
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          GPUs on this node (nvidia-smi)
        </p>
        <Button
          variant="outline"
          size="xs"
          disabled={!selected.length}
          onClick={() => void copyPrefix(selected)}
        >
          <Copy aria-hidden />
          Copy CUDA_VISIBLE_DEVICES
          {selected.length ? `=${[...selected].sort((a, b) => a - b).join(',')}` : ''}
        </Button>
      </div>
      {devices.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => (
            <GpuCard
              key={device.uuid}
              device={device}
              entries={entries.filter((entry) => entry.process.gpuUuid === device.uuid)}
              selected={selected.includes(device.index)}
              onSelectedChange={(checked) =>
                onSelectedChange(
                  checked
                    ? [...selected, device.index]
                    : selected.filter((index) => index !== device.index)
                )
              }
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          nvidia-smi listed no GPUs on this node.
        </p>
      )}
    </div>
  )
}
