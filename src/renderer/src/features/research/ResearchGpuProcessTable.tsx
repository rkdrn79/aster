import { Badge } from '@/components/ui/badge'
import type { ResearchComputeProcessEntry } from './research-compute-usage'
import { formatGpuMemory, formatGpuProcessAge } from './research-compute-format'

export function ResearchGpuProcessTable({
  entries
}: {
  entries: readonly ResearchComputeProcessEntry[]
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-2xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 font-semibold">Host</th>
            <th className="px-2 py-2 font-semibold">GPU</th>
            <th className="px-2 py-2 font-semibold">PID</th>
            <th className="px-2 py-2 font-semibold">User</th>
            <th className="px-2 py-2 text-right font-semibold">Memory</th>
            <th className="px-2 py-2 text-right font-semibold">Running</th>
            <th className="px-2 py-2 font-semibold">Workspace</th>
            <th className="px-4 py-2 font-semibold">Command</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={`${entry.targetId}:${entry.process.gpuUuid}:${entry.process.pid}`}
              className="border-b border-border last:border-b-0 hover:bg-accent/50"
            >
              <td className="max-w-32 truncate px-4 py-2">{entry.hostLabel}</td>
              <td className="whitespace-nowrap px-2 py-2">
                {entry.device ? `GPU ${entry.device.index}` : 'Unknown'}
              </td>
              <td className="px-2 py-2 font-mono">{entry.process.pid}</td>
              <td className="whitespace-nowrap px-2 py-2">
                <span className="inline-flex items-center gap-1.5">
                  {entry.process.user ?? <span className="text-muted-foreground">hidden</span>}
                  {entry.ownedByRemoteUser ? <Badge variant="outline">you</Badge> : null}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                {formatGpuMemory(entry.process.usedMemoryMiB)}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                {formatGpuProcessAge(entry.process.elapsedSeconds)}
              </td>
              <td className="max-w-44 px-2 py-2">
                <span
                  className="block truncate font-mono text-muted-foreground"
                  title={entry.attribution?.workspace.path ?? entry.process.cwd ?? undefined}
                >
                  {entry.attribution ? (
                    <span className="font-sans text-foreground">
                      {entry.attribution.workspace.workspaceName}
                    </span>
                  ) : (
                    (entry.process.cwd ?? '—')
                  )}
                </span>
              </td>
              <td className="max-w-md px-4 py-2">
                <span
                  className="block truncate font-mono text-muted-foreground"
                  title={entry.process.command ?? undefined}
                >
                  {entry.process.command ?? '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
