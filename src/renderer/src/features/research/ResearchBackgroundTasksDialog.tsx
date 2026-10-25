import { useEffect } from 'react'
import { Activity, ArrowUpRight, Bot } from 'lucide-react'
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
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import type { Tab } from '../../../../shared/tab-types'
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
import { researchLiveAgentTasks } from './research-live-agent-tasks'

async function openParentTask(tab: Tab, workspaceId: string): Promise<void> {
  const state = useAppStore.getState()
  const hostId = tab.executionHostId ?? getResolvedExecutionHostIdForWorktree(state, workspaceId)
  const records = useResearchRecords.getState().document
  const background = researchBackgroundTaskForTab(records, tab, hostId)
  if (background && background.workbenchVisible !== true) {
    await updateResearchDelegation(background.id, { workbenchVisible: true })
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
  const tasks = researchLiveAgentTasks(statuses, tabsByWorkspace)
  const recordsError = useResearchRecords((state) => state.error)

  useEffect(() => {
    if (open) {
      void useResearchRecords.getState().load()
      void useResearchLibrary.getState().load()
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl" scrollable>
        <DialogHeader>
          <DialogTitle>Background tasks</DialogTitle>
          <DialogDescription>
            Work running now in open and delegated agents across projects. Finished work leaves this
            list; status is shown only when the agent or host reports it.
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
                        void openParentTask(tab, workspaceId).catch((cause) =>
                          toast.error(`Parent conversation could not be opened: ${String(cause)}`)
                        )
                      }}
                    >
                      <ArrowUpRight aria-hidden />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No child tasks running in open agents.</p>
          )}
        </section>
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
