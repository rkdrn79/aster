import { useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { PhoneRelayPairing, PhoneRelayStatus } from '../../../../shared/phone-relay-contract'
import { phoneRelayErrorText } from './research-phone-relay-error'
import { ResearchPhoneAccessDevices } from './ResearchPhoneAccessDevices'

/** One server's phone access: its relay state, an on/off switch, and a fresh pairing QR. */
export function ResearchPhoneAccessHostRow({
  name,
  environmentId,
  relayUrl,
  onPairing,
  onAccessOff
}: {
  name: string
  environmentId: string
  relayUrl: string
  onPairing: (pairing: PhoneRelayPairing) => Promise<void>
  /** Its QR stops working once access is off, so the dialog drops it. */
  onAccessOff: () => void
}): React.JSX.Element {
  const [status, setStatus] = useState<PhoneRelayStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Why: a fresh QR rotates the unopened link, so the device list re-reads after each one.
  const [pairingCount, setPairingCount] = useState(0)
  const target: RuntimeClientTarget = { kind: 'environment', environmentId }

  useEffect(() => {
    let live = true
    callRuntimeRpc<PhoneRelayStatus>(
      { kind: 'environment', environmentId },
      'phoneRelay.status'
    ).then(
      (next) => live && setStatus(next),
      (cause) => live && setError(phoneRelayErrorText(cause))
    )
    return () => {
      live = false
    }
  }, [environmentId])

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(phoneRelayErrorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const configure = (next: string | null): Promise<void> =>
    run(async () => {
      const configured = await callRuntimeRpc<PhoneRelayStatus>(target, 'phoneRelay.configure', {
        relayUrl: next
      })
      setStatus(configured)
      if (!configured.relayHost) {
        onAccessOff()
      }
    })

  const showQr = (): Promise<void> =>
    run(async () => {
      await onPairing(await callRuntimeRpc(target, 'phoneRelay.pair', {}))
      setPairingCount((count) => count + 1)
    })

  const on = Boolean(status?.relayHost)
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {status === null
              ? error
                ? 'Unavailable'
                : 'Checking…'
              : on
                ? `On, through ${status.relayHost}`
                : 'Off'}
          </p>
        </div>
        {status ? (
          <div className="flex shrink-0 items-center gap-1">
            {on ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void configure(null)}
                >
                  Turn off
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void showQr()}>
                  <QrCode aria-hidden /> Phone QR
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={busy || !relayUrl.trim()}
                onClick={() => void configure(relayUrl.trim())}
              >
                Turn on
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {status ? (
        <ResearchPhoneAccessDevices environmentId={environmentId} refreshKey={pairingCount} />
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
