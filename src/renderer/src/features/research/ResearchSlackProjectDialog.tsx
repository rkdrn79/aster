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
import { isLocalExecutionHost } from '../../../../shared/execution-host'
import type { SlackConnectionStatus } from '../../../../shared/slack-project-connection'
import type { ResearchHomeProject } from './research-home-projects'

function ids(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
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
    const refresh = (hydrate: boolean): void => {
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
  }, [open, project.key])

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
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
        channelIds: ids(channels),
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
      setStatus(await window.api.researchSlack.removeProject(project.key))
      setChannels('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const local = isLocalExecutionHost(primary.executionHostId)
  const bound = status?.routes.some((route) => route.projectKey === project.key)
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
        {!local ? (
          <p className="text-sm text-muted-foreground">
            Slack connections currently require a local project workspace.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Bot: {status?.configured ? 'Configured' : 'Not connected'} · Socket:{' '}
              {status?.connection ?? 'Loading'}
              {status?.error ? ` · ${status.error}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              Tokens come from your Slack app. They are encrypted in this Aster profile and are not
              saved in the project.
            </p>
            <div className="space-y-1">
              <Label htmlFor={`${id}-app`}>Socket Mode app token</Label>
              <Input
                id={`${id}-app`}
                type="password"
                autoComplete="off"
                value={appToken}
                onChange={(event) => setAppToken(event.target.value)}
                placeholder={status?.configured ? 'Leave blank to keep saved token' : 'xapp-…'}
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
                placeholder={status?.configured ? 'Leave blank to keep saved token' : 'xoxb-…'}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-channels`}>Allowed channel IDs</Label>
              <Input
                id={`${id}-channels`}
                value={channels}
                onChange={(event) => setChannels(event.target.value)}
                placeholder="C123ABC, G456DEF"
              />
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
        )}
        <DialogFooter>
          {bound ? (
            <Button variant="outline" disabled={busy} onClick={() => void remove()}>
              Remove project binding
            </Button>
          ) : null}
          <Button disabled={!local || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save connection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
