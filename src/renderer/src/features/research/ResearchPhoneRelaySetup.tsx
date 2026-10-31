import { lazy, Suspense, useEffect, useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'

const OnboardingInlineCommandTerminal = lazy(() =>
  import('@/components/onboarding/OnboardingInlineCommandTerminal').then((module) => ({
    default: module.OnboardingInlineCommandTerminal
  }))
)

export const RELAY_GUIDE_URL = 'https://github.com/rkdrn79/aster/blob/main/relay/README.md'
const SAVED_URL_POLL_MS = 2000

/** Waits for the setup to save a relay URL other than `before`, then hands it over once. */
function useSavedRelayUrlWatch(active: boolean, onFound: (relayUrl: string) => void): void {
  useEffect(() => {
    if (!active) {
      return
    }
    let live = true
    let before: string | null | undefined
    const check = async (): Promise<void> => {
      const saved = await window.api.phoneRelaySetup.savedRelayUrl()
      if (!live) {
        return
      }
      if (before === undefined) {
        before = saved
      } else if (saved && saved !== before) {
        live = false
        onFound(saved)
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), SAVED_URL_POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [active, onFound])
}

/** The README's deploy steps as a guided setup that runs in a local terminal. */
export function ResearchPhoneRelaySetup({
  terminalOpen,
  onTerminalOpenChange,
  onRelayUrlSaved
}: {
  terminalOpen: boolean
  onTerminalOpenChange: (open: boolean) => void
  onRelayUrlSaved: (relayUrl: string) => void
}): React.JSX.Element {
  // Why undefined first: the button stays hidden until main says whether the bundled setup exists.
  const [command, setCommand] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void window.api.phoneRelaySetup.setupCommand().then((next) => live && setCommand(next))
    return () => {
      live = false
    }
  }, [])
  useSavedRelayUrlWatch(terminalOpen, onRelayUrlSaved)

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Set up your own free relay</p>
      <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>
          Create a free Cloudflare account. Skip the payment method, so it can never bill you.
        </li>
        <li>
          Run the setup below. It signs you in to Cloudflare in the browser, deploys the relay to
          your account and saves a private key on this computer.
        </li>
        <li>When it prints Done, the relay URL fills in above.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {command ? (
          <Button
            size="sm"
            variant={terminalOpen ? 'ghost' : 'outline'}
            onClick={() => onTerminalOpenChange(!terminalOpen)}
          >
            <SquareTerminal aria-hidden />
            {terminalOpen ? 'Close setup terminal' : 'Open setup in a terminal'}
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="link"
          onClick={() => void window.api.shell.openUrl(RELAY_GUIDE_URL)}
        >
          {command === null ? 'Follow the setup guide' : 'Read the guide'}
        </Button>
      </div>
      {command && terminalOpen ? (
        <Suspense fallback={<p className="text-xs text-muted-foreground">Opening terminal…</p>}>
          <OnboardingInlineCommandTerminal
            command={command}
            title="Relay setup"
            ariaLabel="Relay setup terminal"
            description="Press Enter to start. Needs Node.js; safe to run again if a step fails."
            terminalHeightPx={260}
            terminalTopMarginPx={0}
            autoScrollIntoView={false}
            worktreeId="phone-relay-setup-terminal"
            forceHostRuntime
          />
        </Suspense>
      ) : null}
    </div>
  )
}
