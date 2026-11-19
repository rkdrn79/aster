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
import { PhoneNotifyMenuItem } from './PhoneNotifyMenuItem'
import { hostStateLabel, usePhoneHostStatus } from './use-phone-host-status'

/**
 * Header overflow: host status, the full sidebar, and Settings, kept off the tab bar. A session
 * screen adds its one destructive action last, apart from the rest.
 */
export function PhoneHeaderMenu({
  destructiveAction
}: {
  destructiveAction?: { label: string; run: () => void } | null
}): React.JSX.Element {
  const host = usePhoneHostStatus()
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
                host.connection === 'connected'
                  ? 'bg-status-success'
                  : host.connection === 'reconnecting'
                    ? 'bg-status-warning'
                    : 'bg-destructive'
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
