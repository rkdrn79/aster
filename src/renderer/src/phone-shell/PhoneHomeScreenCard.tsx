import { useMemo, useState } from 'react'
import { Copy, Download, Smartphone, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { readHomeScreenPairingLink } from '@/web/web-home-screen-pairing'
import { isStandaloneDisplayMode, useWebInstallPrompt } from '@/web/web-install-prompt'
import { homeScreenPlatform, homeScreenSteps } from './phone-home-screen-install'

const DISMISSED_KEY = 'aster.web.homeScreenCard.dismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Why ignored: private browsing may refuse storage; the card then just returns next visit.
  }
}

/** The link as selectable text, for a browser that refused the clipboard write. */
function LinkFallback({ link }: { link: string }): React.JSX.Element {
  return (
    <div className="mt-3">
      <p className="text-[13px] text-muted-foreground">
        Copying was blocked. Select the link and copy it:
      </p>
      <textarea
        readOnly
        value={link}
        rows={3}
        aria-label="Pairing link for the Home Screen app"
        ref={(node) => node?.select()}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-1.5 w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs break-all text-foreground"
      />
    </div>
  )
}

/**
 * Pairs the Home Screen app without the Mac: on iOS that app keeps its own storage, so it needs
 * this tab's pairing link once. Shown in a browser tab only, until dismissed.
 */
export function PhoneHomeScreenCard(): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState(readDismissed)
  const [copyFailed, setCopyFailed] = useState(false)
  const install = useWebInstallPrompt((state) => state.prompt)
  const link = useMemo(() => readHomeScreenPairingLink(), [])
  if (dismissed || isStandaloneDisplayMode()) {
    return null
  }
  const platform = homeScreenPlatform(navigator.userAgent, navigator.maxTouchPoints)
  const steps = homeScreenSteps(platform, { canPrompt: install !== null, hasLink: link !== null })

  async function copy(): Promise<void> {
    if (!link) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(link)
      setCopyFailed(false)
      toast.success('Link copied', { description: 'Paste it once in the Home Screen app.' })
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <section
      aria-label="Add Aster to your Home Screen"
      className="mx-4 mt-5 rounded-xl border border-border bg-card px-4 pt-3.5 pb-4"
      data-phone-home-screen-card=""
    >
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="min-w-0 flex-1 text-base leading-snug font-semibold">
          Add Aster to your Home Screen
        </h2>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            writeDismissed()
            setDismissed(true)
          }}
          className="-mt-2 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {steps.length > 1 ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{steps[0]}</p>
      )}
      {install ? (
        <Button className="mt-3 w-full" onClick={() => void install()}>
          <Download aria-hidden />
          Install Aster
        </Button>
      ) : null}
      {link ? (
        <>
          <Button
            variant={install ? 'outline' : 'default'}
            className="mt-3 w-full"
            onClick={() => void copy()}
          >
            <Copy aria-hidden />
            Copy link for the Home Screen app
          </Button>
          {copyFailed ? <LinkFallback link={link} /> : null}
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            The link signs in to your server like a password. Paste it only into Aster, and don’t
            share it.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          This tab no longer holds the pairing link. Scan the phone QR from Aster on your Mac again,
          then copy the link here.
        </p>
      )}
    </section>
  )
}
