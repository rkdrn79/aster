import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AgentStateDot, type AgentDotState } from '@/components/AgentStateDot'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import {
  ORCHESTRATION_WORKER_STATE_LABELS,
  orchestrationWorkerSummaryLabel,
  summarizeOrchestrationWorkers,
  type NativeChatOrchestrationWorker
} from '../native-chat/native-chat-orchestration-workers'
import { tabStripSubagents } from './tab-strip-subagents'
import { openSubagentTab } from './subagent-tab-open'

// Why: the strip sits in the window drag region; typed so no style cast is needed.
const NO_DRAG: React.CSSProperties & { WebkitAppRegion: string } = { WebkitAppRegion: 'no-drag' }

const DOT_STATE: Record<NativeChatOrchestrationWorker['state'], AgentDotState> = {
  pending: 'idle',
  dispatched: 'working',
  working: 'working',
  waiting: 'waiting',
  blocked: 'blocked',
  completed: 'done',
  failed: 'failed'
}

/** Folds the workers launched from this strip's tabs into one "N running" chip and list. */
export function TabStripSubagentsIndicator({
  stripTabIds,
  activeTabId
}: {
  /** Unified ids of the tabs this strip shows; their workers are the ones listed. */
  stripTabIds: readonly string[]
  activeTabId: string | null
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const sources = useAppStore(
    useShallow((state) => ({
      runtimeAgentOrchestrationByPaneKey: state.runtimeAgentOrchestrationByPaneKey,
      agentStatusByPaneKey: state.agentStatusByPaneKey,
      retainedAgentsByPaneKey: state.retainedAgentsByPaneKey,
      unifiedTabsByWorktree: state.unifiedTabsByWorktree
    }))
  )
  // Why: the strip passes a fresh array each render; the joined ids keep the memo stable.
  const stripKey = stripTabIds.join('\n')
  const workers = useMemo(
    () => tabStripSubagents(sources, stripKey ? stripKey.split('\n') : []),
    [sources, stripKey]
  )
  if (workers.length === 0) {
    return null
  }
  const summary = summarizeOrchestrationWorkers(workers)
  const label = orchestrationWorkerSummaryLabel(summary)
  const leadState: AgentDotState =
    summary.waiting > 0
      ? 'waiting'
      : summary.running > 0
        ? 'working'
        : summary.failed > 0
          ? 'failed'
          : 'done'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="my-auto ml-1"
          style={NO_DRAG}
          aria-label={`Subagents: ${label}`}
          data-subagents-indicator=""
        >
          <AgentStateDot state={leadState} size="sm" title={null} />
          {/* Why: narrow strips (phones, split panes) keep the count and drop the words. */}
          <span className="text-muted-foreground tabular-nums @max-[420px]/tab-strip:hidden">
            {label}
          </span>
          <span className="hidden text-muted-foreground tabular-nums @max-[420px]/tab-strip:inline">
            {workers.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-1rem)]">
        <div className="p-1">
          <p className="px-2 pt-1.5 pb-1 text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
            Subagents
          </p>
          <ul
            role="list"
            aria-label="Subagents"
            className="scrollbar-sleek max-h-72 overflow-y-auto"
          >
            {workers.map((worker) => {
              const tab = worker.tab
              const stateLabel = ORCHESTRATION_WORKER_STATE_LABELS[worker.state]
              return (
                <li key={worker.paneKey}>
                  <button
                    type="button"
                    disabled={!tab}
                    aria-current={tab?.id === activeTabId ? 'true' : undefined}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none aria-[current=true]:bg-accent"
                    onClick={() => {
                      if (tab && openSubagentTab(tab)) {
                        setOpen(false)
                      }
                    }}
                  >
                    <AgentStateDot
                      state={DOT_STATE[worker.state]}
                      size="sm"
                      title={null}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {worker.name}
                      </span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {worker.activity ? `${stateLabel} · ${worker.activity}` : stateLabel}
                        {tab ? '' : ' · no open tab'}
                      </span>
                    </span>
                    {worker.updatedAt ? (
                      <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                        {formatShortTimeAgo(worker.updatedAt)}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
