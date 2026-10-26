import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Bot, ChevronDown } from 'lucide-react'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { useResearchInlineWorkerTabs } from '@/features/research/research-inline-worker-tabs'
import { cn } from '@/lib/utils'
import { nativeChatOrchestrationWorkers } from './native-chat-orchestration-workers'

const STATE_LABELS = {
  pending: 'Pending',
  dispatched: 'Dispatched',
  working: 'Working',
  waiting: 'Waiting',
  blocked: 'Needs input',
  completed: 'Completed',
  failed: 'Failed'
} as const

/** A parent chat keeps its independently launched workers nearby, with explicit drill-in. */
export function NativeChatOrchestrationWorkers({
  paneKey
}: {
  paneKey: string
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(true)
  const sources = useAppStore(
    useShallow((state) => ({
      runtimeAgentOrchestrationByPaneKey: state.runtimeAgentOrchestrationByPaneKey,
      agentStatusByPaneKey: state.agentStatusByPaneKey,
      retainedAgentsByPaneKey: state.retainedAgentsByPaneKey,
      unifiedTabsByWorktree: state.unifiedTabsByWorktree
    }))
  )
  const workers = useMemo(
    () => nativeChatOrchestrationWorkers(sources, paneKey),
    [sources, paneKey]
  )
  if (workers.length === 0) {
    return null
  }

  return (
    <section aria-label="Subagents" className="shrink-0 bg-chat-canvas px-3 pt-2 sm:px-4">
      <div className="mx-auto w-full max-w-(--chat-content-max-width) rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground shadow-xs">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Bot aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 font-medium text-foreground">
            Subagents ({workers.length})
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-3 transition-transform', expanded && 'rotate-180')}
          />
        </button>
        {expanded ? (
          <ul
            role="list"
            className="scrollbar-sleek max-h-40 space-y-0.5 overflow-y-auto border-t border-border px-2 py-1.5"
          >
            {workers.map((worker) => {
              const contents = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      worker.state === 'failed'
                        ? 'bg-destructive'
                        : worker.state === 'working'
                          ? 'bg-foreground/70'
                          : 'bg-muted-foreground/50',
                      worker.state === 'working' && 'animate-pulse motion-reduce:animate-none'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">{worker.name}</span>
                  <span className="shrink-0">{STATE_LABELS[worker.state]}</span>
                </>
              )
              return (
                <li key={worker.paneKey}>
                  {worker.tab ? (
                    <button
                      type="button"
                      className="flex min-h-6 w-full items-center gap-2 rounded-md px-1.5 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => {
                        const tab = worker.tab
                        if (!tab) {
                          return
                        }
                        const activated = activateAndRevealWorkspace(
                          tab.worktreeId,
                          tab.executionHostId ? { executionHostId: tab.executionHostId } : undefined
                        )
                        if (activated === false) {
                          return
                        }
                        useResearchInlineWorkerTabs.getState().show(tab.id)
                        useAppStore.getState().activateTab(tab.id, { worktreeId: tab.worktreeId })
                      }}
                    >
                      {contents}
                    </button>
                  ) : (
                    <div className="flex min-h-6 items-center gap-2 px-1.5">{contents}</div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
