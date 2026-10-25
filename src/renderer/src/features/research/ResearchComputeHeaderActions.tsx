import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getIntlLocale } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ResearchComputeRefreshSelect } from './ResearchComputeRefreshSelect'

/** Settings > SSH with its add-host form open. */
export function openAddSshHost(): void {
  const state = useAppStore.getState()
  state.openSettingsTarget({ pane: 'ssh', repoId: null, intent: 'add-ssh-host' })
  state.openSettingsPage()
}

/** Names why a header action is disabled; a disabled button cannot show its own tooltip. */
function DisabledReason({
  reason,
  children
}: {
  reason: string | null
  children: React.JSX.Element
}): React.JSX.Element {
  if (!reason) {
    return children
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{reason}</TooltipContent>
    </Tooltip>
  )
}

export function ResearchComputeHeaderActions({
  lastCapturedAt,
  refreshIntervalMs,
  onRefreshIntervalChange,
  readable,
  refreshing,
  onRefresh,
  canSubmitJobs,
  hasSlurmHost,
  onNewJob
}: {
  lastCapturedAt: string | undefined
  refreshIntervalMs: number
  onRefreshIntervalChange: (intervalMs: number) => void
  readable: boolean
  refreshing: boolean
  onRefresh: () => void
  canSubmitJobs: boolean
  hasSlurmHost: boolean
  onNewJob: () => void
}): React.JSX.Element {
  return (
    <>
      {lastCapturedAt ? (
        <span className="text-xs text-muted-foreground">
          Updated {new Date(lastCapturedAt).toLocaleTimeString(getIntlLocale())}
        </span>
      ) : null}
      <ResearchComputeRefreshSelect
        intervalMs={refreshIntervalMs}
        onChange={onRefreshIntervalChange}
      />
      <DisabledReason reason={readable ? null : 'Select a connected host first'}>
        <Button variant="outline" size="sm" disabled={!readable || refreshing} onClick={onRefresh}>
          <RefreshCw aria-hidden className={cn(refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </DisabledReason>
      {canSubmitJobs ? (
        <DisabledReason reason={hasSlurmHost ? null : 'New jobs need a connected Slurm host'}>
          <Button size="sm" disabled={!hasSlurmHost} onClick={onNewJob}>
            <Plus aria-hidden />
            New job
          </Button>
        </DisabledReason>
      ) : null}
    </>
  )
}
