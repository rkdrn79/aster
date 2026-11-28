import { useState } from 'react'
import { toast } from 'sonner'
import type { ServerAutoUpdateHostStatus } from '../../../../shared/server-auto-update'
import type { ManagedOrcadPreloadApi } from '../../../../preload/api/managed-orcad-api'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { LoadingSpinner } from '../LoadingSpinner'
import { Button } from '../ui/button'
import { ServerAutoUpdateHostModeSelect } from './ServerAutoUpdateHostModeSelect'
import { ServerAutoUpdateNowDialog } from './ServerAutoUpdateNowDialog'
import { ServerAutoUpdateSlackNote } from './ServerAutoUpdateSlackNote'
import {
  agentsWorkingCount,
  canUpdateNow,
  serverAutoUpdateNowMessage,
  serverAutoUpdateStatusLine,
  updateNowNeedsConfirmation,
  type ServerAutoUpdateLineTone
} from './server-auto-update-copy'

const TONE_CLASS: Record<ServerAutoUpdateLineTone, string> = {
  muted: 'text-muted-foreground',
  warning: 'text-status-warning',
  destructive: 'text-destructive'
}

/**
 * A managed server row's automatic-update line: where the update stands, Update now when the
 * person can move it along, and this host's own choice of when updates run.
 */
export function ManagedServerAutoUpdateLine({
  status,
  api
}: {
  status: ServerAutoUpdateHostStatus
  api: Pick<ManagedOrcadPreloadApi, 'autoUpdateNow' | 'setAutoUpdateMode'>
}): React.JSX.Element {
  const mountedRef = useMountedRef()
  const globalMode = useAppStore((state) => state.settings?.serverAutoUpdate)
  const [running, setRunning] = useState(false)
  // Why a count, not a flag: the dialog states how many agents it cuts off, as of the click.
  const [confirmAgents, setConfirmAgents] = useState<number | null>(null)
  const line = serverAutoUpdateStatusLine(status)
  const updating = status.phase === 'updating' || running

  const updateNow = async (): Promise<void> => {
    setRunning(true)
    try {
      const message = serverAutoUpdateNowMessage(
        await api.autoUpdateNow({ selector: status.environmentId }),
        status.hostLabel
      )
      if (message.kind === 'success') {
        toast.success(message.text)
      } else if (message.kind === 'error') {
        toast.error(message.text)
      } else {
        toast.message(message.text)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      if (mountedRef.current) {
        setRunning(false)
      }
    }
  }

  return (
    <div data-testid="server-auto-update" data-phase={status.phase} className="space-y-1.5">
      <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1.5">
        {line ? (
          <p
            data-testid="server-auto-update-status"
            data-phase={status.phase}
            className={cn(
              'flex min-w-0 flex-1 basis-48 items-center gap-1.5 text-xs',
              TONE_CLASS[line.tone]
            )}
          >
            {line.busy ? <LoadingSpinner className="size-3 shrink-0" /> : null}
            <span className="min-w-0">{line.text}</span>
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {canUpdateNow(status) ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              data-testid="server-auto-update-now"
              disabled={updating}
              onClick={() =>
                updateNowNeedsConfirmation(status)
                  ? setConfirmAgents(agentsWorkingCount(status))
                  : void updateNow()
              }
            >
              {running ? <LoadingSpinner className="size-3" /> : null}
              {translate('auto.components.settings.serverAutoUpdate.updateNow', 'Update now')}
            </Button>
          ) : null}
          <ServerAutoUpdateHostModeSelect status={status} api={api} globalMode={globalMode} />
        </div>
      </div>
      {status.slackBridge?.kind === 'old' && status.slackBridge.unit ? (
        <ServerAutoUpdateSlackNote unit={status.slackBridge.unit} />
      ) : null}
      <ServerAutoUpdateNowDialog
        agents={confirmAgents}
        hostLabel={status.hostLabel}
        onCancel={() => setConfirmAgents(null)}
        onConfirm={() => {
          setConfirmAgents(null)
          void updateNow()
        }}
      />
    </div>
  )
}
