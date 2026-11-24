import { X } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { selectResearchInsideProject } from './research-navigation'
import { MAIN_COLUMN, type ResearchSplitSide } from './research-split-layout'
import { useResearchSplitProjectLabel } from './research-split-project'
import { useRemoteHostLabel } from './research-host-label'
import { closeResearchSplitMainColumn } from './research-split-open'
import {
  closeResearchSide,
  focusResearchSplitColumn,
  useResearchSplit
} from './research-split-store'

function SplitTab({
  columnId,
  workspaceId,
  hostId,
  onClose
}: {
  columnId: string
  workspaceId: string | null
  hostId: string | null
  onClose: (() => void) | null
}): React.JSX.Element {
  const label = useResearchSplitProjectLabel(workspaceId, hostId)
  const hostLabel = useRemoteHostLabel(hostId)
  const selected = useResearchSplit((state) => state.focused === columnId)
  return (
    <div
      className={cn(
        'group flex h-8 min-w-0 max-w-64 items-center gap-1 rounded-lg pr-1 transition-colors duration-(--duration-fast)',
        selected ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/50'
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        data-research-split-tab={columnId}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg pl-3 text-left text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => focusResearchSplitColumn(columnId, { keyboard: true })}
      >
        <ResearchComputeProjectDot color={label.badgeColor} />
        <span className="min-w-0 truncate">{label.name}</span>
        {hostLabel ? (
          <span className="shrink-0 truncate text-2xs font-normal text-muted-foreground">
            {hostLabel}
          </span>
        ) : null}
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={`Close ${label.name}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

/**
 * Too narrow for the columns side by side: each project becomes a tab on the shell, and the one
 * picked shows below. Picking a tab also gives it the keyboard, as clicking its column would.
 */
export function ResearchSplitTabs({
  sides
}: {
  sides: readonly ResearchSplitSide[]
}): React.JSX.Element {
  const mainWorkspace = useAppStore((state) =>
    selectResearchInsideProject(state) ? state.activeWorktreeId : null
  )
  const mainHost = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  return (
    <div
      role="tablist"
      aria-label="Projects side by side"
      className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto scrollbar-none mb-2"
    >
      <SplitTab
        columnId={MAIN_COLUMN}
        workspaceId={mainWorkspace}
        hostId={mainWorkspace ? mainHost : null}
        onClose={closeResearchSplitMainColumn}
      />
      {sides.map((side) => (
        <SplitTab
          key={side.id}
          columnId={side.id}
          workspaceId={side.workspaceId}
          hostId={side.hostId}
          onClose={() => closeResearchSide(side.id)}
        />
      ))}
    </div>
  )
}
