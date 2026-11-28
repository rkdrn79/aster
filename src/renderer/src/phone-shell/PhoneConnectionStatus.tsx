import { useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePhoneServerUpdatedNotice } from './phone-server-updated'
import { usePhoneHostStatus, type PhoneHostConnection } from './use-phone-host-status'

// Why a delay: a heartbeat re-check is not news; a link down this long is.
const BANNER_DELAY_MS = 1500

const DOT: Record<PhoneHostConnection, string> = {
  connected: 'bg-status-success',
  reconnecting: 'bg-status-warning',
  offline: 'bg-destructive'
}

const WORD: Record<PhoneHostConnection, string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  offline: 'Offline'
}

/** The host and its link state, under a tab screen's title. */
export function PhoneHostStatusLine(): React.JSX.Element {
  const host = usePhoneHostStatus()
  return (
    <p
      className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-tight text-muted-foreground"
      data-phone-host-status={host.connection}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[host.connection])} />
      <span className="truncate">
        {host.name} · {WORD[host.connection]}
      </span>
    </p>
  )
}

function useShownAfterDelay(show: boolean): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!show) {
      return
    }
    const timer = window.setTimeout(() => setShown(true), BANNER_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      setShown(false)
    }
  }, [show])
  return show && shown
}

/** The few seconds after the host came back on a newer Aster than it had before. */
function PhoneServerUpdatedBanner({ version }: { version: string }): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      data-phone-connection-banner="updated"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted py-2 pr-[max(env(safe-area-inset-right),1rem)] pl-[max(env(safe-area-inset-left),1rem)] text-[13px] text-foreground"
    >
      <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden />
      <span className="min-w-0 truncate">Server updated to {version}</span>
    </div>
  )
}

/**
 * A band under the header on every screen while the host cannot be reached, and briefly after
 * the host came back updated.
 */
export function PhoneConnectionBanner(): React.JSX.Element | null {
  const host = usePhoneHostStatus()
  const shown = useShownAfterDelay(host.connection !== 'connected')
  const updatedTo = usePhoneServerUpdatedNotice({
    connected: host.connection === 'connected',
    appVersion: host.appVersion
  })
  if (host.connection === 'connected') {
    return updatedTo ? <PhoneServerUpdatedBanner version={updatedTo} /> : null
  }
  if (!shown) {
    return null
  }
  const offline = host.connection === 'offline'
  return (
    <div
      role="status"
      aria-live="polite"
      data-phone-connection-banner={host.connection}
      className={cn(
        'flex shrink-0 items-center gap-2 border-b py-2 pr-[max(env(safe-area-inset-right),1rem)] pl-[max(env(safe-area-inset-left),1rem)] text-[13px]',
        offline
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-status-warning-border bg-status-warning-background text-status-warning'
      )}
    >
      {offline ? (
        <CloudOff className="size-4 shrink-0" aria-hidden />
      ) : (
        <LoaderCircle
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      )}
      <span className="min-w-0 truncate">
        {offline
          ? `Offline · ${host.name} is not answering. Aster keeps trying.`
          : `${host.state === 'checking' ? 'Connecting to' : 'Reconnecting to'} ${host.name}…`}
      </span>
    </div>
  )
}
