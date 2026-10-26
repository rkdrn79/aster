import { useEffect } from 'react'
import { Activity, ArrowUpRight, Bot, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import type { Tab } from '../../../../shared/tab-types'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import { ResearchDelegationList } from './ResearchDelegationList'
import { enterResearchWorkspace, openResearchView } from './research-navigation'
import { useResearchRecords } from './research-records-store'
import { useResearchLibrary } from './research-library-store'
import { researchBackgroundTaskForTab } from './research-background-tab'
import { updateResearchDelegation } from './research-delegation-launch'
import { researchConversationHome } from './research-conversation-home'
import { libraryScopeKey } from '../../../../shared/research/research-library'
import { requestLibraryAgentFocus } from './research-library-agent-focus'
import { requestWritingAgentFocus } from './research-writing-agent-focus'
import { researchLiveAgentTasks, researchLiveTaskDismissalKey } from './research-live-agent-tasks'
import { useResearchSlackBackgroundTasks } from './research-slack-background-tasks'
import { useResearchDelegationRows } from './use-research-delegation-rows'
import { useResearchActiveProject } from './research-home-projects'
import {
  dismissResearchDelegations,
  useResearchDelegationDismissals
} from './research-delegation-dismissals'

async function openParentTask(
  tab: Tab,
  workspaceId: string,
  slackTasks: readonly ResearchDelegationRecord[]
): Promise<void> {
  const state = useAppStore.getState()
  const hostId = tab.executionHostId ?? getResolvedExecutionHostIdForWorktree(state, workspaceId)
  const records = useResearchRecords.getState().document
  const background = researchBackgroundTaskForTab(records, tab, hostId, slackTasks)
  if (background && background.workbenchVisible !== true) {
    if (slackTasks.some((task) => task.id === background.id)) {
      useResearchSlackBackgroundTasks.getState().setWorkbenchVisible(background.id, true)
    } else {
      await updateResearchDelegation(background.id, { workbenchVisible: true })
    }
  }
  enterResearchWorkspace({ id: workspaceId, executionHostId: tab.executionHostId })
  const home =
    tab.contentType === 'agent-session'
      ? researchConversationHome(
          records,
          useResearchLibrary.getState().document,
          hostId,
          workspaceId,
          tab.entityId
        )
      : { kind: 'workbench' as const }
  if (home.kind === 'writing') {
    await useResearchRecords.getState().update((current) => ({
      ...current,
      selectedExperimentId: home.experimentId
    }))
    requestWritingAgentFocus(home.experimentId)
    openResearchView('research-writing')
    return
  }
  if (home.kind === 'library' && hostId) {
    requestLibraryAgentFocus(libraryScopeKey({ hostId, workspaceId }))
    openResearchView('research-library')
    return
  }
  state.setActiveView('terminal')
  state.activateTab(tab.id, { worktreeId: workspaceId })
}

export function ResearchBackgroundTasksDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const statuses = useAppStore((state) => state.agentStatusByPaneKey)
  const tabsByWorkspace = useAppStore((state) => state.unifiedTabsByWorktree)
  const now = useNow(60_000, open)
  const dismissals = useResearchDelegationDismissals()
  const tasks = researchLiveAgentTasks(statuses, tabsByWorkspace, now, dismissals)
  const slackEntries = useResearchSlackBackgroundTasks((state) => state.entries)
  const slackTasks = slackEntries.map((entry) => entry.delegation)
  const slackRows = useResearchDelegationRows(slackTasks)
  const { project } = useResearchActiveProject()
  const recordsError = useResearchRecords((state) => state.error)

  useEffect(() => {
    if (open) {
      void useResearchRecords.getState().load()
      void useResearchLibrary.getState().load()
      if (project) {
        void useResearchSlackBackgroundTasks
          .getState()
          .refresh(project)
          .catch(() => {})
      }
    }
  }, [open, project])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl" scrollable>
        <DialogHeader>
          <DialogTitle>Background tasks</DialogTitle>
          <DialogDescription>
            Agent work across projects. Finished delegated work leaves the live list; Slack
            coordinator sessions remain here so you can inspect their threads.
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-2" aria-label="Live agent work">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Activity className="size-4" aria-hidden />
            Live agent work · {tasks.length}
          </div>
          {tasks.length ? (
            <div className="space-y-1.5">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs"
                >
                  <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{task.name}</p>
                    <p className="text-muted-foreground">
                      {task.state} · {task.parentLabel} · Last observed{' '}
                      {new Date(task.observedAt).toLocaleString()}
                    </p>
                    {task.detail ? (
                      <p className="line-clamp-2 text-muted-foreground">{task.detail}</p>
                    ) : null}
                  </div>
                  {task.tab && task.workspaceId ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Open parent conversation for ${task.name}`}
                      onClick={() => {
                        const tab = task.tab
                        const workspaceId = task.workspaceId
                        if (!tab || !workspaceId) {
                          return
                        }
                        onClose()
                        void openParentTask(tab, workspaceId, slackTasks).catch((cause) =>
                          toast.error(`Parent conversation could not be opened: ${String(cause)}`)
                        )
                      }}
                    >
                      <ArrowUpRight aria-hidden />
                    </Button>
                  ) : null}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Dismiss ${task.name} from background tasks`}
                    title="Hide until new activity"
                    onClick={() =>
                      dismissResearchDelegations(
                        [researchLiveTaskDismissalKey(task.id)],
                        task.observedAt
                      )
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No child tasks running in open agents.</p>
          )}
        </section>
        {slackRows.length ? (
          <section className="space-y-2" aria-label="Slack coordinator tasks">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Bot className="size-4" aria-hidden />
              Slack coordinators · {slackRows.length}
            </div>
            <div className="space-y-1.5">
              {slackRows.map((row) => (
                <div
                  key={row.delegation.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.delegation.task}</p>
                    <p className="text-muted-foreground">
                      {row.activity.label} · {row.delegation.targetLabel}
                    </p>
                  </div>
                  {row.tab ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Open ${row.delegation.task} in Workbench`}
                      onClick={() => {
                        onClose()
                        void openParentTask(
                          row.tab!,
                          row.delegation.targetWorkspaceId,
                          slackTasks
                        ).catch((cause) =>
                          toast.error(`Slack coordinator could not be opened: ${String(cause)}`)
                        )
                      }}
                    >
                      <ArrowUpRight aria-hidden />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {recordsError ? (
          <p role="alert" className="text-xs text-destructive">
            {recordsError}
          </p>
        ) : null}
        <ResearchDelegationList showAllInitially showEmpty showHistory />
      </DialogContent>
    </Dialog>
  )
}
