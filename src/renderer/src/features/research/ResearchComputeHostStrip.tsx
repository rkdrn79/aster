import { useEffect, useState } from 'react'
import { Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { HostListOverflowNote } from '@/components/host-picker/HostListOverflowNote'
import { HostListSearchField } from '@/components/host-picker/HostListSearchField'
import { useBoundedHostRows } from '@/components/host-picker/use-bounded-host-rows'
import { cn } from '@/lib/utils'
import type { ResearchComputeSample } from '../../../../shared/research/research-compute-probe'

export type ResearchComputeHost = {
  targetId: string
  label: string
  /** Aster holds a live SSH connection to this target. */
  connected: boolean
  /** Shown and read on this page; read over OpenSSH while Aster is not connected to it. */
  selected: boolean
}

export function isReadableComputeHost(host: ResearchComputeHost): boolean {
  return host.selected
}

type JobCount = { running: number; pending: number }

function hostStatus(
  sample: ResearchComputeSample | undefined,
  pending: boolean,
  jobs: JobCount | undefined
): { label: string; tone: 'ok' | 'warning' | 'idle' } {
  if (!sample) {
    return { label: pending ? 'Reading…' : 'Waiting', tone: 'idle' }
  }
  if (sample.status === 'not-connected') {
    return { label: 'Not connected', tone: 'idle' }
  }
  if (sample.status === 'unsupported-host') {
    return { label: 'Unsupported host', tone: 'warning' }
  }
  if (sample.status === 'ok' && sample.slurm.status === 'ok') {
    return { label: `SLURM · ${jobs?.running ?? 0} R · ${jobs?.pending ?? 0} PD`, tone: 'ok' }
  }
  if (sample.status === 'ok' && sample.gpu.status === 'ok') {
    const count = sample.gpu.devices.length
    return { label: `${count} ${count === 1 ? 'GPU' : 'GPUs'}`, tone: 'ok' }
  }
  if (
    sample.status === 'ok' &&
    sample.slurm.status === 'missing' &&
    sample.gpu.status === 'missing'
  ) {
    return { label: 'No SLURM or nvidia-smi', tone: 'idle' }
  }
  return { label: 'Read failed', tone: 'warning' }
}

/** `user@host` per target, so aliases of one machine under different accounts stay apart. */
function useSshTargetAddresses(): ReadonlyMap<string, string> {
  const [addresses, setAddresses] = useState<ReadonlyMap<string, string>>(new Map())
  useEffect(() => {
    window.api.ssh
      .listTargets()
      .then((targets) =>
        setAddresses(
          new Map(
            targets.map((target) => [
              target.id,
              target.username ? `${target.username}@${target.host}` : target.host
            ])
          )
        )
      )
      .catch(() => {
        // Addresses only disambiguate labels; the picker works without them.
      })
  }, [])
  return addresses
}

export function ResearchComputeHostStrip({
  hosts,
  samples,
  pending,
  openProjectJobs,
  onSelectedChange
}: {
  hosts: readonly ResearchComputeHost[]
  samples: Readonly<Record<string, ResearchComputeSample>>
  pending: ReadonlySet<string>
  /** Counted over projects open in Aster, so the chip matches the list below it. */
  openProjectJobs: ReadonlyMap<string, JobCount>
  onSelectedChange: (targetId: string, selected: boolean) => void
}): React.JSX.Element {
  const addresses = useSshTargetAddresses()
  const selected = hosts.filter((host) => host.selected)
  // Why bounded: a generated ~/.ssh/config can hold thousands of hosts; picked ones stay pinned.
  const rows = useBoundedHostRows(
    hosts.map((host) => ({
      id: host.targetId,
      label: host.label,
      searchText: addresses.get(host.targetId),
      selected: host.selected
    })),
    new Set(selected.map((host) => host.targetId))
  )
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="SSH hosts">
      {selected.map((host) => {
        const sample = samples[host.targetId]
        const status = hostStatus(
          sample,
          pending.has(host.targetId),
          openProjectJobs.get(host.targetId)
        )
        return (
          <div
            key={host.targetId}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs"
            title={addresses.get(host.targetId)}
          >
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full bg-muted-foreground/40',
                status.tone === 'ok' && 'bg-status-success',
                status.tone === 'warning' && 'bg-status-warning'
              )}
            />
            <span className="max-w-48 truncate font-medium">{host.label}</span>
            <Badge variant="outline">{status.label}</Badge>
          </div>
        )
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Server aria-hidden />
            Hosts ({selected.length} of {hosts.length})
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-sm">
          <DropdownMenuLabel>SSH hosts to read</DropdownMenuLabel>
          {rows.searchable ? (
            <HostListSearchField value={rows.query} onChange={rows.setQuery} inMenu />
          ) : null}
          <div className="max-h-80 overflow-y-auto scrollbar-sleek">
            {rows.shown.map((row) => (
              <DropdownMenuCheckboxItem
                key={row.id}
                checked={row.selected}
                // Keep the menu open so several hosts can be picked in one go.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => onSelectedChange(row.id, checked === true)}
              >
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <span className="truncate text-muted-foreground">{row.searchText ?? ''}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </div>
          <HostListOverflowNote hiddenCount={rows.hiddenCount} />
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Hosts that are not connected are read over your ssh config, read-only.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
