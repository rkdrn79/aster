import { WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { useNativeChatHostOutage } from '@/components/native-chat/use-native-chat-host-outage'
import { useNativeChatHostOutageNotice } from '@/components/native-chat/use-native-chat-host-outage-notice'
import { selectRuntimeAwareSshStatus } from '@/store/slices/runtime-environment-ssh-selectors'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { selectResearchWorkspaceContext } from './research-workspace-context'

function RuntimeHostBanner({ environmentId }: { environmentId: string }): React.JSX.Element | null {
  const outage = useNativeChatHostOutage({ kind: 'environment', environmentId })
  const notice = useNativeChatHostOutageNotice(outage)
  if (!notice) {
    return null
  }
  const offline = outage?.kind === 'offline'
  return (
    <p
      role="status"
      className={
        offline
          ? 'flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-status-warning'
          : 'flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground'
      }
    >
      <WifiOff className="size-3.5" aria-hidden />
      <span className="min-w-0 truncate">
        {notice.text}
        {offline ? ' Pages here will work again once it reconnects.' : ''}
      </span>
      {notice.action ? (
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          disabled={notice.action.disabled}
          onClick={notice.action.onClick}
        >
          {notice.action.label}
        </Button>
      ) : null}
    </p>
  )
}

function SshHostBanner({
  hostId,
  targetId
}: {
  hostId: `ssh:${string}`
  targetId: string
}): React.JSX.Element | null {
  const status = useAppStore((state) => selectRuntimeAwareSshStatus(state, null, targetId))
  const label = useAppStore((state) => selectExecutionHostDisplayLabel(state, hostId))
  if (status === 'connected' || status === null) {
    return null
  }
  return (
    <p
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-status-warning"
    >
      <WifiOff className="size-3.5" aria-hidden />
      <span className="min-w-0 truncate">
        {label} is not connected. Pages here will work again once it reconnects.
      </span>
    </p>
  )
}

/** Says, across every page of a project window, when the project's host can't be reached. */
export function ResearchWindowHostBanner(): React.JSX.Element | null {
  const hostId = useAppStore((state) => selectResearchWorkspaceContext(state).hostId)
  const host = parseExecutionHostId(hostId)
  if (host?.kind === 'runtime') {
    return <RuntimeHostBanner environmentId={host.environmentId} />
  }
  if (host?.kind === 'ssh') {
    return <SshHostBanner hostId={host.id} targetId={host.targetId} />
  }
  return null
}
