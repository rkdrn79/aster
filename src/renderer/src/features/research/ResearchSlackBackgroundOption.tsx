import { useId, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import type { SlackConnectionStatus } from '../../../../shared/slack-project-connection'

const OWNER_LABELS = {
  app: 'this app',
  service: 'background service',
  other: 'another Slack bridge process'
} as const

const OFF_HELP =
  'Runs the Slack connection as a per-user service, plus Aster’s background runtime if it is missing, so mentions are answered while the window is closed. Mentions sent while this computer sleeps or is off are answered when it reconnects.'

function enabledHelp(installedRuntime: boolean): string {
  const store = navigator.userAgent.includes('Mac') ? 'your login Keychain' : 'an owner-only file'
  return `A per-user background service holds the Slack connection; its tokens are in ${store}.${installedRuntime ? ' Aster’s background runtime was installed so agents can answer while the window is closed.' : ''}`
}

/** Connection summary plus the opt-in that moves the Slack socket into a per-user service. */
export function ResearchSlackBackgroundOption({
  status,
  bound,
  onStatus,
  onError
}: {
  status: SlackConnectionStatus | null
  bound: boolean
  onStatus: (status: SlackConnectionStatus) => void
  onError: (message: string | null) => void
}): React.JSX.Element {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const background = status?.background
  const unavailable = background?.unavailableReason ?? null
  const ready = Boolean(status?.configured) && bound

  async function toggle(enabled: boolean): Promise<void> {
    setBusy(true)
    onError(null)
    try {
      onStatus(await window.api.researchSlack.setBackground(enabled))
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Bot: {status?.configured ? 'Configured' : 'Not connected'} · Socket:{' '}
        {status?.connection ?? 'Loading'}
        {status?.owner ? ` · Connected by ${OWNER_LABELS[status.owner]}` : ''}
        {status?.error ? ` · ${status.error}` : ''}
      </p>
      {status?.notice ? <p className="text-xs text-muted-foreground">{status.notice}</p> : null}
      <div className="flex items-center justify-between gap-3 pt-1">
        <label htmlFor={`${id}-background`} className="text-sm">
          Keep Slack connected when Aster is closed
        </label>
        <Switch
          id={`${id}-background`}
          checked={background?.enabled ?? false}
          disabled={busy || unavailable !== null || (!background?.enabled && !ready)}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {unavailable ?? (background?.enabled ? enabledHelp(background.installedRuntime) : OFF_HELP)}
      </p>
    </div>
  )
}
