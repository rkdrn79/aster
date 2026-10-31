import { useMemo } from 'react'
import { CircleStop, Ellipsis, PanelLeft, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { useCompactDrawer } from '@/app-shell/compact-drawer-store'
import {
  runtimeHostConnectionStateForEntry,
  type RuntimeHostConnectionState
} from '@/runtime/runtime-host-connection-state'
import { readStoredWebRuntimeEnvironment } from '@/web/web-runtime-environment'
import { PhoneNotifyMenuItem } from './PhoneNotifyMenuItem'

function hostStateLabel(state: RuntimeHostConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'workspace-window-closed':
      return 'Connected, no workspace window'
    case 'checking':
      return 'Checking'
    case 'reconnecting':
      return 'Reconnecting'
    case 'runtime-unavailable':
      return 'Server not answering'
    case 'disconnected':
      return 'Disconnected'
  }
}

/** The paired host this phone drives, named the way it was paired. */
function useHostStatus(): {
  name: string
  endpoint: string | null
  state: RuntimeHostConnectionState
} {
  const environment = useMemo(() => readStoredWebRuntimeEnvironment(), [])
  const entry = useAppStore((state) =>
    environment ? state.runtimeStatusByEnvironmentId.get(environment.id) : undefined
  )
  const endpoint = environment?.endpoints[0]?.endpoint ?? null
  return {
    name: environment?.name ?? 'Host',
    endpoint: endpoint ? endpoint.replace(/^wss?:\/\//, '') : null,
    // Why: the web client only renders once paired, so a missing entry means still checking.
    state: entry ? runtimeHostConnectionStateForEntry(entry) : 'checking'
  }
}

/**
 * Header overflow: host status, the full sidebar, and Settings, kept off the tab bar. A session
 * screen adds its one destructive action last, apart from the rest.
 */
export function PhoneHeaderMenu({
  destructiveAction
}: {
  destructiveAction?: { label: string; run: () => void } | null
}): React.JSX.Element {
  const host = useHostStatus()
  const setActiveView = useAppStore((state) => state.setActiveView)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent"
        >
          <Ellipsis className="size-5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="w-64">
        <DropdownMenuLabel>
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span
              aria-hidden
              className={cn(
                'size-2 shrink-0 rounded-full',
                host.state === 'connected' ? 'bg-status-success' : 'bg-status-warning'
              )}
            />
            {host.name}
          </span>
          <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
            {hostStateLabel(host.state)}
            {host.endpoint ? ` · ${host.endpoint}` : ''}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11"
          onSelect={() => useCompactDrawer.getState().setOpen(true)}
        >
          <PanelLeft aria-hidden />
          All pages and workspaces
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onSelect={() => setActiveView('settings')}>
          <Settings aria-hidden />
          Settings
        </DropdownMenuItem>
        <PhoneNotifyMenuItem />
        {destructiveAction ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="min-h-11"
              onSelect={destructiveAction.run}
            >
              <CircleStop aria-hidden />
              {destructiveAction.label}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
