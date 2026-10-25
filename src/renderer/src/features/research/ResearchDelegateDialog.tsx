import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useAgentMenuObservation } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import { useAppStore } from '@/store'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { useResearchHomeProjects } from './research-home-projects'
import { useResearchRecords } from './research-records-store'
import { trackDelegationLaunch } from './research-delegation-launch'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'

type Destination = {
  key: string
  workspaceId: string
  hostId: ExecutionHostId
  label: string
}

/** Workspaces open on computers other than the source's: where Delegate can send work. */
export function useDelegateDestinations(sourceHostId: string | null): Destination[] {
  const projects = useResearchHomeProjects()
  return projects.flatMap((project) =>
    project.workspaces.flatMap((workspace) => {
      const hostId = workspace.executionHostId
      if (!hostId || hostId === sourceHostId) {
        return []
      }
      return [
        {
          key: JSON.stringify([hostId, workspace.id]),
          workspaceId: workspace.id,
          hostId,
          label: `${project.name} / ${workspace.name} · ${selectExecutionHostDisplayLabel(useAppStore.getState(), hostId)}`
        }
      ]
    })
  )
}

/** Settings › SSH Hosts, where another computer is added. */
export function openComputerSettings(): void {
  const state = useAppStore.getState()
  state.openSettingsTarget({ pane: 'ssh', repoId: null, sectionId: 'ssh' })
  state.openSettingsPage()
}

function timestamp(): string {
  return new Date().toISOString()
}

function DelegateBody({
  sourceWorkspaceId,
  sourceHostId,
  sourceExperimentId,
  destinations,
  onClose
}: {
  sourceWorkspaceId: string
  sourceHostId: string
  sourceExperimentId: string | null
  destinations: Destination[]
  onClose: () => void
}): React.JSX.Element {
  const [targetKey, setTargetKey] = useState(destinations[0]?.key ?? '')
  const [agentKey, setAgentKey] = useState('')
  const [task, setTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const destination = destinations.find((entry) => entry.key === targetKey)
  const detectionTarget = useAgentDetectionTargetForWorktree(destination?.workspaceId ?? null)
  const { model: menu } = useAgentMenuObservation(
    destination?.workspaceId ?? null,
    Boolean(destination),
    detectionTarget
  )
  const available =
    menu.state === 'settled'
      ? menu.rows.filter(
          (row) => row.kind === 'chat' || row.kind === 'cli' || row.kind === 'terminal'
        )
      : []
  const selected = available.find((row) => `${row.kind}:${row.agent}` === agentKey)

  async function delegate(): Promise<void> {
    if (!destination || !selected || !task.trim() || busy) {
      return
    }
    setBusy(true)
    setError(null)
    const result = launchAgentInNewTab({
      requestId: newAgentLaunchRequestId(),
      requestedSurface: selected.kind === 'chat' ? 'chat' : 'terminal',
      selectedExecutionHostId: destination.hostId,
      agent: selected.agent,
      worktreeId: destination.workspaceId,
      prompt: task.trim(),
      promptDelivery: selected.kind === 'chat' ? 'auto-submit' : 'submit-after-ready',
      onStructuredHostDeclined: () => ({ opened: false }),
      activate: false
    })
    if (!result) {
      setError('This host could not start the agent. Check its connection and agent support.')
      setBusy(false)
      return
    }
    const id = createBrowserUuid()
    const now = timestamp()
    const delegation: ResearchDelegationRecord = {
      id,
      sourceWorkspaceId,
      sourceHostId,
      sourceExperimentId,
      targetWorkspaceId: destination.workspaceId,
      targetHostId: destination.hostId,
      targetLabel: destination.label,
      agent: selected.agent,
      task: task.trim().slice(0, 240),
      tabId: result.surface.kind === 'host-published' ? null : result.surface.tabId,
      sessionId: null,
      state: 'launching',
      createdAt: now,
      updatedAt: now
    }
    try {
      await useResearchRecords.getState().update((current) => ({
        ...current,
        delegations: [delegation, ...current.delegations].slice(0, 500)
      }))
    } catch (cause) {
      setError(`The agent may have started, but its link was not saved: ${String(cause)}`)
      setBusy(false)
      return
    }
    onClose()
    trackDelegationLaunch(id, result)
  }

  return (
    <DialogContent className="sm:max-w-xl" scrollable>
      <DialogHeader>
        <DialogTitle>Delegate to another computer</DialogTitle>
        <DialogDescription>
          Start an agent chat in a workspace on another computer. Files stay where they are.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-xs">
        {destinations.length ? (
          <>
            <div className="space-y-1">
              <p className="font-medium">Destination workspace</p>
              <Select
                value={targetKey}
                onValueChange={(value) => {
                  setTargetKey(value)
                  setAgentKey('')
                  setError(null)
                }}
              >
                <SelectTrigger className="w-full" aria-label="Destination workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((entry) => (
                    <SelectItem key={entry.key} value={entry.key}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Agent</p>
              <Select value={agentKey} onValueChange={setAgentKey}>
                <SelectTrigger className="w-full" aria-label="Agent">
                  <SelectValue
                    placeholder={menu.state === 'loading' ? 'Checking host…' : 'Choose an agent'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {available.map((row) => (
                    <SelectItem key={`${row.kind}:${row.agent}`} value={`${row.kind}:${row.agent}`}>
                      {formatAgentTypeLabel(row.agent)} ·{' '}
                      {row.kind === 'chat' ? 'chat' : 'terminal'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {menu.state === 'settled' && !available.length ? (
                <p className="text-muted-foreground">No agent is available on this computer.</p>
              ) : null}
            </div>
            <label className="block space-y-1 font-medium">
              Task
              <Textarea
                value={task}
                onChange={(event) => setTask(event.target.value)}
                placeholder="Describe the work and the expected result."
                className="mt-1 min-h-28"
                maxLength={20_000}
              />
            </label>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              No other computer is connected. Connect one over SSH or pair an Aster server, then
              open this project there to delegate work to it.
            </p>
            <Button
              size="sm"
              variant="outline"
              autoFocus
              onClick={() => {
                onClose()
                openComputerSettings()
              }}
            >
              <Plus aria-hidden /> Connect a computer…
            </Button>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {destinations.length ? (
          <Button
            disabled={busy || !destination || !selected || !task.trim()}
            onClick={() => void delegate()}
          >
            {busy ? 'Starting…' : 'Delegate'}
          </Button>
        ) : null}
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchDelegateDialog({
  open,
  onClose,
  sourceWorkspaceId,
  sourceHostId,
  sourceExperimentId
}: {
  open: boolean
  onClose: () => void
  sourceWorkspaceId: string | null
  sourceHostId: string | null
  sourceExperimentId: string | null
}): React.JSX.Element {
  const destinations = useDelegateDestinations(sourceHostId)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && sourceWorkspaceId && sourceHostId ? (
        <DelegateBody
          sourceWorkspaceId={sourceWorkspaceId}
          sourceHostId={sourceHostId}
          sourceExperimentId={sourceExperimentId}
          destinations={destinations}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}
