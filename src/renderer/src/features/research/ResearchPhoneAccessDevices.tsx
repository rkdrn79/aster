import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { getIntlLocale } from '@/i18n/i18n'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { cn } from '@/lib/utils'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type {
  PhoneRelayDevice,
  PhoneRelayDevices,
  PhoneRelayRevokeResult
} from '../../../../shared/phone-relay-contract'
import { phoneRelayErrorText } from './research-phone-relay-error'

// Why: pair() names a link "Phone <date>", and the paired line already shows when.
const DATED_PHONE_LINK_NAME = /^Phone [\d./\s-]+$/
// Why: a phone that opens the shown QR should appear while the dialog is still open.
const UNOPENED_REFRESH_MS = 3000

function deviceTitle(device: PhoneRelayDevice): string {
  if (device.lastSeenAt === null) {
    return 'Unopened QR'
  }
  return DATED_PHONE_LINK_NAME.test(device.name) ? 'Phone' : device.name
}

function pairedText(device: PhoneRelayDevice): string {
  const paired = new Date(device.pairedAt).toLocaleString(getIntlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  return `${device.lastSeenAt === null ? 'Created' : 'Paired'} ${paired}`
}

function lastSeenText(device: PhoneRelayDevice): string {
  if (device.lastSeenAt === null) {
    return 'not opened yet'
  }
  const ago = formatShortTimeAgo(device.lastSeenAt)
  return ago === 'now' ? 'Seen just now' : `Seen ${ago} ago`
}

function summaryText(devices: readonly PhoneRelayDevice[]): string {
  const phones = devices.filter((device) => device.lastSeenAt !== null).length
  const unopened = devices.length - phones
  const count = phones === 0 ? 'No phones' : phones === 1 ? '1 phone' : `${phones} phones`
  return unopened > 0 ? `${count} · ${unopened} unopened QR` : count
}

function PhoneDeviceRow({
  device,
  onRevoke
}: {
  device: PhoneRelayDevice
  onRevoke: () => Promise<void>
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const revokeTriggerRef = useRef<HTMLButtonElement>(null)
  const refocusTrigger = useRef(false)
  useEffect(() => {
    // Why: Cancel unmounts with focus on it, so keyboard focus goes back to the row's Revoke.
    if (!confirming && refocusTrigger.current) {
      refocusTrigger.current = false
      revokeTriggerRef.current?.focus()
    }
  }, [confirming])
  const revoke = async (): Promise<void> => {
    setRevoking(true)
    try {
      await onRevoke()
    } finally {
      setRevoking(false)
      setConfirming(false)
    }
  }
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{deviceTitle(device)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {pairedText(device)} · {lastSeenText(device)}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="xs"
            variant="destructive"
            disabled={revoking}
            autoFocus
            onClick={() => void revoke()}
          >
            Revoke
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={revoking}
            onClick={() => {
              refocusTrigger.current = true
              setConfirming(false)
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          ref={revokeTriggerRef}
          size="xs"
          variant="ghost"
          aria-label={`Revoke ${deviceTitle(device)}`}
          onClick={() => setConfirming(true)}
        >
          Revoke
        </Button>
      )}
    </li>
  )
}

/** Phones this server paired through phone access; a leaked QR is a credential, so each is revocable. */
export function ResearchPhoneAccessDevices({
  environmentId,
  refreshKey
}: {
  environmentId: string
  refreshKey: number
}): React.JSX.Element | null {
  const [devices, setDevices] = useState<PhoneRelayDevice[] | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await callRuntimeRpc<PhoneRelayDevices>(
        { kind: 'environment', environmentId },
        'phoneRelay.devices'
      )
      setDevices(result.devices)
      setError(null)
    } catch (cause) {
      setError(phoneRelayErrorText(cause))
    }
  }, [environmentId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const awaitingPhone = devices?.some((device) => device.lastSeenAt === null) ?? false
  useEffect(() => {
    if (!awaitingPhone) {
      return
    }
    const timer = window.setInterval(() => void load(), UNOPENED_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [awaitingPhone, load])

  const revoke = async (deviceId: string): Promise<void> => {
    try {
      const result = await callRuntimeRpc<PhoneRelayRevokeResult>(
        { kind: 'environment', environmentId },
        'phoneRelay.revoke',
        { deviceId }
      )
      if (!result.revoked) {
        setError('That phone was already revoked or could not be removed.')
      }
    } catch (cause) {
      setError(phoneRelayErrorText(cause))
    }
    await load()
  }

  if (error && devices === null) {
    return <p className="text-xs text-muted-foreground">{error}</p>
  }
  if (devices === null) {
    return null
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          disabled={devices.length === 0}
          className="flex items-center gap-1 rounded-md py-0.5 pr-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        >
          {devices.length > 0 ? (
            <ChevronRight
              aria-hidden
              className={cn('size-3.5 transition-transform', open && 'rotate-90')}
            />
          ) : null}
          {summaryText(devices)}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 divide-y divide-border border-t border-border">
          {devices.map((device) => (
            <PhoneDeviceRow
              key={device.deviceId}
              device={device}
              onRevoke={() => revoke(device.deviceId)}
            />
          ))}
        </ul>
      </CollapsibleContent>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </Collapsible>
  )
}
