import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import QRCodeBrowser from 'qrcode/lib/browser'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { isListedRemoteServer } from '../../../../shared/runtime-environments'
import type { PhoneRelayPairing } from '../../../../shared/phone-relay-contract'
import { openAddSshHost } from './ResearchComputeHeaderActions'
import { ResearchPhoneAccessHostRow } from './ResearchPhoneAccessHostRow'
import { RELAY_GUIDE_URL, ResearchPhoneRelaySetup } from './ResearchPhoneRelaySetup'

// Why local storage: one relay serves every server, and each server keeps its own copy once on.
const RELAY_URL_STORAGE_KEY = 'aster.phoneRelay.url'

type ShownPairing = { environmentId: string; hostName: string; link: string; qr: string }

/** Phone access for every server at once, so it isn't tied to whichever project is open. */
export function ResearchPhoneAccessDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const savedEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const servers = useMemo(() => savedEnvironments.filter(isListedRemoteServer), [savedEnvironments])
  const [relayUrl, setRelayUrl] = useState(
    () => window.localStorage.getItem(RELAY_URL_STORAGE_KEY) ?? ''
  )
  const [pairing, setPairing] = useState<ShownPairing | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupTerminalOpen, setSetupTerminalOpen] = useState(false)
  // Why: the guided setup waits for the saved-URL check, so a saved relay never flashes it.
  const [savedUrlChecked, setSavedUrlChecked] = useState(false)
  const relayUrlFieldId = useId()
  const hasRelayUrl = relayUrl.trim().length > 0

  // Why once per open, into state only: clearing the field must not refill it, and the saved file
  // stays the source until the user edits the field.
  useEffect(() => {
    if (!open) {
      return
    }
    let live = true
    void window.api.phoneRelaySetup
      .savedRelayUrl()
      .catch(() => null)
      .then((saved) => {
        if (!live) {
          return
        }
        if (saved) {
          setRelayUrl((current) => (current.trim() ? current : saved))
        }
        setSavedUrlChecked(true)
      })
    return () => {
      live = false
    }
  }, [open])

  const updateRelayUrl = (next: string): void => {
    setRelayUrl(next)
    window.localStorage.setItem(RELAY_URL_STORAGE_KEY, next.trim())
  }

  const adoptSavedRelayUrl = useCallback((saved: string): void => {
    setRelayUrl(saved)
    setSetupTerminalOpen(false)
  }, [])

  const showPairing = async (
    environmentId: string,
    hostName: string,
    next: PhoneRelayPairing
  ): Promise<void> => {
    // Why low correction: the link carries the whole offer, and denser codes scan worse.
    const qr = await QRCodeBrowser.toDataURL(next.webClientUrl, {
      errorCorrectionLevel: 'L',
      margin: 2,
      width: 280
    })
    setPairing({ environmentId, hostName, link: next.webClientUrl, qr })
    setCopied(false)
  }

  // Why the main-process clipboard: Electron refuses navigator.clipboard writes here.
  const copyLink = async (): Promise<void> => {
    if (!pairing) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(pairing.link)
      setCopied(true)
    } catch (cause) {
      setError(String(cause))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={setupTerminalOpen ? 'sm:max-w-2xl' : 'sm:max-w-lg'}
        scrollable
        // Why: Esc belongs to the setup terminal; closing here would also end the setup.
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('.xterm')) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Phone access</DialogTitle>
          <DialogDescription>
            Open a server’s projects on your phone through your own relay, even while this Mac is
            off.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={relayUrlFieldId}>Relay URL</Label>
          <Input
            id={relayUrlFieldId}
            type="password"
            placeholder="wss://aster-relay.<you>.workers.dev/ws?key=…"
            value={relayUrl}
            onChange={(event) => updateRelayUrl(event.target.value)}
          />
          {hasRelayUrl ? (
            <Button
              size="xs"
              variant="link"
              className="self-start"
              onClick={() => void window.api.shell.openUrl(RELAY_GUIDE_URL)}
            >
              Relay setup guide
            </Button>
          ) : null}
        </div>
        {hasRelayUrl || !savedUrlChecked ? null : (
          <ResearchPhoneRelaySetup
            terminalOpen={setupTerminalOpen}
            onTerminalOpenChange={setSetupTerminalOpen}
            onRelayUrlSaved={adoptSavedRelayUrl}
          />
        )}
        {servers.length === 0 ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Phone access works for SSH servers. Add one first.</span>
            <Button size="sm" variant="outline" onClick={openAddSshHost}>
              Add SSH host
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {servers.map((server) => (
              <ResearchPhoneAccessHostRow
                key={server.id}
                name={server.name}
                environmentId={server.id}
                relayUrl={relayUrl}
                onPairing={(next) => showPairing(server.id, server.name, next)}
                onAccessOff={() =>
                  setPairing((shown) => (shown?.environmentId === server.id ? null : shown))
                }
              />
            ))}
          </div>
        )}
        {pairing ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-border p-3 text-center">
            <p className="text-xs font-medium">{pairing.hostName}</p>
            <img src={pairing.qr} alt="Phone pairing QR code" width={280} height={280} />
            <Button size="sm" variant="ghost" onClick={() => void copyLink()}>
              <Copy aria-hidden /> {copied ? 'Copied' : 'Copy link'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Scan with the phone camera and open it. To keep Aster on the Home Screen, add it from
              the browser’s Share menu, open it there, and paste the copied link once. Anyone with
              this code can open the server, so keep it private. A new code retires the last one
              only if no phone opened it; revoke an opened one from the server’s phone list.
            </p>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
