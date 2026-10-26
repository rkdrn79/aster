import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Activity, Repeat, Send, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { useResearchRecords } from './research-records-store'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { ResearchPageHeader } from './ResearchPageLayout'
import { ResearchDelegateDialog, useDelegateDestinations } from './ResearchDelegateDialog'
import { ResearchLoopStartDialog } from './ResearchLoopStartDialog'
import { ResearchBackgroundTasksDialog } from './ResearchBackgroundTasksDialog'
import { ResearchPhoneChatsDialog } from './ResearchPhoneChatsDialog'
import { openResearchExperimentPage } from './research-experiment-page'
import { researchRunStatusLabel } from './research-run-status-label'
import { researchActiveAgentTaskCount } from './research-live-agent-tasks'
import { useResearchDelegationDismissals } from './research-delegation-dismissals'
import { useResearchDelegationRows } from './use-research-delegation-rows'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'

const NO_DELEGATIONS: ResearchDelegationRecord[] = []

/** Background work running or waiting on the user, across projects: what the dialog lists live. */
function useActiveBackgroundTaskCount(): number {
  const now = useNow(60_000)
  const statuses = useAppStore((state) => state.agentStatusByPaneKey)
  const dismissals = useResearchDelegationDismissals()
  const childTasks = researchActiveAgentTaskCount(statuses, now, dismissals)
  const delegations = useResearchRecords((state) => state.document?.delegations ?? NO_DELEGATIONS)
  const rows = useResearchDelegationRows(delegations)
  return childTasks + rows.filter((row) => row.active).length
}

export function ResearchWorkbench(): React.JSX.Element {
  useTranslation()
  const [delegateOpen, setDelegateOpen] = useState(false)
  const [loopOpen, setLoopOpen] = useState(false)
  const [backgroundTasksOpen, setBackgroundTasksOpen] = useState(false)
  const [phoneChatsOpen, setPhoneChatsOpen] = useState(false)
  const activeTasks = useActiveBackgroundTaskCount()
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const delegateDestinations = useDelegateDestinations(context.hostId)
  const document = useResearchRecords((state) => state.document)
  const experiment = document?.experiments.find(
    (entry) => entry.id === document.selectedExperimentId
  )
  const workspaceMismatch = Boolean(
    experiment &&
    (experiment.workspaceId !== context.workspaceId || experiment.hostId !== context.hostId)
  )

  return (
    <div className="shrink-0 text-foreground" data-research-workbench="">
      <ResearchPageHeader
        title={translate('research.navigation.workbench', 'Workbench')}
        actions={
          <>
            {context.hostId &&
            context.workspaceId &&
            context.workspacePath &&
            window.api?.researchPaseo ? (
              <Button size="sm" variant="ghost" onClick={() => setPhoneChatsOpen(true)}>
                <Smartphone aria-hidden /> Phone chats
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={
                activeTasks ? `Background tasks, ${activeTasks} active` : 'Background tasks'
              }
              onClick={() => setBackgroundTasksOpen(true)}
            >
              <Activity aria-hidden />
              Background tasks
              {activeTasks ? <Badge variant="secondary">{activeTasks}</Badge> : null}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!context.workspaceId || !context.hostId}
              onClick={() => setLoopOpen(true)}
            >
              <Repeat aria-hidden />
              Start research loop
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!context.workspaceId || !context.hostId}
                  onClick={() => setDelegateOpen(true)}
                >
                  <Send aria-hidden />
                  Delegate
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {delegateDestinations.length
                  ? 'Send a task to an agent on another computer'
                  : 'Connect another computer to delegate'}
              </TooltipContent>
            </Tooltip>
          </>
        }
      />
      {workspaceMismatch && experiment ? (
        <div
          role="status"
          className="flex items-center gap-3 border-b border-border px-6 py-1.5 text-xs text-muted-foreground"
        >
          <span className="min-w-0 flex-1 truncate">
            {experiment.name} belongs to another workspace.
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const host = parseExecutionHostId(experiment.hostId)
              if (host) {
                useAppStore.getState().setActiveWorktree(experiment.workspaceId, host.id)
              }
            }}
          >
            Open its workspace
          </Button>
        </div>
      ) : null}
      <ResearchLoopStartDialog open={loopOpen} onClose={() => setLoopOpen(false)} />
      {phoneChatsOpen && context.hostId && context.workspaceId && context.workspacePath ? (
        <ResearchPhoneChatsDialog
          key={`${context.hostId}:${context.workspaceId}`}
          open={phoneChatsOpen}
          onClose={() => setPhoneChatsOpen(false)}
          scope={{
            hostId: context.hostId,
            workspaceId: context.workspaceId,
            workspacePath: context.workspacePath
          }}
        />
      ) : null}
      {backgroundTasksOpen ? (
        <ResearchBackgroundTasksDialog
          open={backgroundTasksOpen}
          onClose={() => setBackgroundTasksOpen(false)}
        />
      ) : null}
      <ResearchDelegateDialog
        open={delegateOpen}
        onClose={() => setDelegateOpen(false)}
        sourceWorkspaceId={context.workspaceId}
        sourceHostId={context.hostId}
        sourceExperimentId={!workspaceMismatch ? (experiment?.id ?? null) : null}
      />
    </div>
  )
}

/** A quiet footer naming the selected Run of this workspace; nothing when none is selected. */
export function ResearchRunStatus(): React.JSX.Element | null {
  const workspaceId = useAppStore((state) => state.activeWorktreeId)
  const document = useResearchRecords((state) => state.document)
  const run = document?.runs.find(
    (entry) => entry.id === document.selectedRunId && entry.workspaceId === workspaceId
  )
  if (!run) {
    return null
  }
  return (
    <div className="flex shrink-0 items-center border-t border-border px-2 py-0.5 text-xs">
      <Button
        size="xs"
        variant="ghost"
        className="min-w-0"
        onClick={() => openResearchExperimentPage(run.experimentId, 'runs')}
      >
        <span className="truncate text-muted-foreground">
          {run.name}
          {run.execution === 'unknown' ? '' : ` · ${researchRunStatusLabel(run.execution)}`}
        </span>
      </Button>
    </div>
  )
}
