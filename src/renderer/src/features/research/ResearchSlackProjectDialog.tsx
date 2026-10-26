import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { parseRoutableExecutionHostId } from '../../../../shared/execution-host'
import type {
  SlackConnectionStatus,
  SlackRemoteProjectStatus
} from '../../../../shared/slack-project-connection'
import type { ResearchHomeProject } from './research-home-projects'
import { parseSlackChannelIds } from './research-slack-channel-input'
import { ResearchSlackBackgroundOption } from './ResearchSlackBackgroundOption'

function ids(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isProjectServerHost(executionHostId: string | undefined): boolean {
  const kind = parseRoutableExecutionHostId(executionHostId ?? 'local')?.kind
  return kind === 'ssh' || kind === 'runtime'
}

export function ResearchSlackProjectDialog({
  project,
  open,
  onOpenChange
}: {
  project: ResearchHomeProject
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const id = useId()
  const primary = project.workspaces[0]
  const [status, setStatus] = useState<SlackConnectionStatus | null>(null)
  const [remoteStatus, setRemoteStatus] = useState<SlackRemoteProjectStatus | null>(null)
  const [appToken, setAppToken] = useState('')
  const [botToken, setBotToken] = useState('')
  const [channels, setChannels] = useState('')
  const [users, setUsers] = useState('*')
  const [agent, setAgent] = useState<'codex' | 'claude'>('codex')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    setError(null)
    const server = isProjectServerHost(primary.executionHostId)
    const refresh = (hydrate: boolean): void => {
      if (server) {
        void window.api.researchSlack
          .getRemoteProject({ executionHostId: primary.executionHostId!, projectKey: project.key })
          .then((next) => {
            if (!active) {
              return
            }
            setRemoteStatus(next)
            if (hydrate) {
              setChannels(next.route?.channelIds.join(', ') ?? '')
              setUsers(next.route?.allowedUsers.join(', ') ?? '*')
              setAgent(next.route?.agent === 'claude' ? 'claude' : 'codex')
            }
          })
          .catch((cause: unknown) => active && setError(String(cause)))
        return
      }
      void window.api.researchSlack
        .get()
        .then((next) => {
          if (!active) {
            return
          }
          setStatus(next)
          if (hydrate) {
            const saved = next.routes.find((route) => route.projectKey === project.key)
            setChannels(saved?.channelIds.join(', ') ?? '')
            setUsers(saved?.allowedUsers.join(', ') ?? '*')
            setAgent(saved?.agent === 'claude' ? 'claude' : 'codex')
          }
        })
        .catch((cause: unknown) => active && setError(String(cause)))
    }
    refresh(true)
    const timer = setInterval(() => refresh(false), 4_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [open, project.key, primary.executionHostId])

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const channelIds = parseSlackChannelIds(channels)
      const server = isProjectServerHost(primary.executionHostId)
      if (server) {
        if ((!appToken || !botToken) && !remoteStatus?.configured) {
          throw new Error('Enter both Slack tokens to configure this project server')
        }
        const next = await window.api.researchSlack.saveRemoteProject({
          route: {
            projectKey: project.key,
            projectName: project.name,
            workspacePath: primary.path,
            executionHostId: primary.executionHostId,
            workspaceId: primary.id,
            channelIds,
            allowedUsers: ids(users),
            agent
          },
          appToken,
          botToken
        })
        setRemoteStatus(next)
        setAppToken('')
        setBotToken('')
        onOpenChange(false)
        return
      }
      if (appToken || botToken) {
        if (!appToken || !botToken) {
          throw new Error('Enter both Slack tokens to connect the bot')
        }
        await window.api.researchSlack.credentials({ appToken, botToken })
        setAppToken('')
        setBotToken('')
      } else if (!status?.configured) {
        throw new Error('Connect a Slack bot first')
      }
      const next = await window.api.researchSlack.saveProject({
        projectKey: project.key,
        projectName: project.name,
        workspacePath: primary.path,
        executionHostId: primary.executionHostId ?? 'local',
        workspaceId: primary.id,
        channelIds,
        allowedUsers: ids(users),
        agent
      })
      setStatus(next)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      if (isProjectServerHost(primary.executionHostId)) {
        setRemoteStatus(
          await window.api.researchSlack.removeRemoteProject({
            executionHostId: primary.executionHostId!,
            projectKey: project.key
          })
        )
        setChannels('')
        return
      }
      setStatus(await window.api.researchSlack.removeProject(project.key))
      setChannels('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const server = isProjectServerHost(primary.executionHostId)
  const bound = server
    ? Boolean(remoteStatus?.route)
    : status?.routes.some((route) => route.projectKey === project.key)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent surface="security" size="compact" scrollable>
        <DialogHeader>
          <DialogTitle>Slack · {project.name}</DialogTitle>
          <DialogDescription>
            A native bot mention in a selected channel opens a background Aster coordinator for this
            project. The coordinator can delegate to an existing agent or start a worker.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {server ? (
            <p className="text-sm text-muted-foreground">
              This Slack connection runs on the project server. Once connected, it can answer while
              this computer is off. Server status: {remoteStatus?.connection ?? 'checking'}.
              {remoteStatus?.error ? ` ${remoteStatus.error}` : ''}
            </p>
          ) : null}
          {!server ? (
            <ResearchSlackBackgroundOption
              status={status}
              bound={Boolean(status?.routes.length)}
              onStatus={setStatus}
              onError={setError}
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Tokens come from your Slack app.{' '}
            {server
              ? 'They are stored in the SSH server user profile, not in the project.'
              : 'They are encrypted in this Aster profile and are not saved in the project.'}{' '}
            The bot needs the app_mentions:read, chat:write, channels:history and groups:history
            scopes; the history scopes let Aster answer mentions sent while it was offline.
            Reinstall the Slack app after adding scopes.
          </p>
          <div className="space-y-1">
            <Label htmlFor={`${id}-app`}>Socket Mode app token</Label>
            <Input
              id={`${id}-app`}
              type="password"
              autoComplete="off"
              value={appToken}
              onChange={(event) => setAppToken(event.target.value)}
              placeholder={
                server && remoteStatus?.configured
                  ? 'Leave blank to keep server token'
                  : status?.configured && !server
                    ? 'Leave blank to keep saved token'
                    : 'xapp-…'
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-bot`}>Bot token</Label>
            <Input
              id={`${id}-bot`}
              type="password"
              autoComplete="off"
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder={
                server && remoteStatus?.configured
                  ? 'Leave blank to keep server token'
                  : status?.configured && !server
                    ? 'Leave blank to keep saved token'
                    : 'xoxb-…'
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-channels`}>Allowed channels</Label>
            <Input
              id={`${id}-channels`}
              value={channels}
              onChange={(event) => setChannels(event.target.value)}
              placeholder="C123ABC or paste a Slack channel link"
            />
            <p className="text-xs text-muted-foreground">
              Enter channel IDs separated by commas, or paste links from the Slack Copy link action.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-users`}>Allowed Slack users</Label>
            <Input
              id={`${id}-users`}
              value={users}
              onChange={(event) => setUsers(event.target.value)}
              placeholder="U123ABC, U456DEF or *"
            />
            <p className="text-xs text-muted-foreground">
              * allows any member of the selected channels to call the bot.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Background coordinator</Label>
            <Select
              value={agent}
              onValueChange={(value) => setAgent(value === 'claude' ? 'claude' : 'codex')}
            >
              <SelectTrigger className="w-full" aria-label="Background coordinator agent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="codex">Codex</SelectItem>
                <SelectItem value="claude">Claude Code</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          {bound ? (
            <Button variant="outline" disabled={busy} onClick={() => void remove()}>
              Remove project binding
            </Button>
          ) : null}
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save connection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
