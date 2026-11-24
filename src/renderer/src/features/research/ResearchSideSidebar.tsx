import { useMemo } from 'react'
import {
  BookOpen,
  FilePenLine,
  FlaskConical,
  MessageSquareReply,
  PanelLeftOpen,
  PanelsTopLeft,
  Shapes,
  X,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { resolveLeftSidebarStyleVariables } from '@/lib/left-sidebar-appearance'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { TopLevelView } from '../../../../shared/ui-chrome-types'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { ResearchNavigation } from './ResearchNavigation'
import { ResearchProjectSwitcher } from './ResearchProjectSwitcher'
import { ResearchWorkspaceShortcut } from './ResearchWorkspaceShortcut'
import { useResearchSideFocus } from './ResearchNavigationProjectRow'
import { useResearchActiveProject } from './research-home-projects'
import { useRemoteHostLabel } from './research-host-label'
import { openResearchView, type ResearchPage } from './research-navigation'
import { toggleResearchSideSidebar, useResearchSideSidebarCollapsed } from './research-side-sidebar'

const RAIL_PAGES: readonly { view: 'terminal' | ResearchPage; label: string; Icon: LucideIcon }[] =
  [
    { view: 'terminal', label: 'Workbench', Icon: PanelsTopLeft },
    { view: 'research-experiments', label: 'Experiments', Icon: FlaskConical },
    { view: 'research-writing', label: 'Writing', Icon: FilePenLine },
    { view: 'research-figures', label: 'Figures', Icon: Shapes },
    { view: 'research-rebuttal', label: 'Rebuttal', Icon: MessageSquareReply },
    { view: 'research-library', label: 'Library', Icon: BookOpen }
  ]

/** An Experiment's own pages (runs, compare) still mark Experiments as the current one. */
function railCurrent(view: TopLevelView, entry: 'terminal' | ResearchPage): boolean {
  if (entry === 'research-experiments') {
    return view === entry || view === 'research-runs' || view === 'research-compare'
  }
  return view === entry
}

function RailButton({
  label,
  current,
  onClick,
  children
}: {
  label: string
  current?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={current ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label={label}
          aria-current={current ? 'page' : undefined}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** A narrow side's sidebar: the same project and pages as icons, so the page keeps its room. */
function ResearchSideRail(): React.JSX.Element {
  const { project, workspace } = useResearchActiveProject()
  const hostLabel = useRemoteHostLabel(workspace?.executionHostId)
  const activeView = useAppStore((state) => state.activeView)
  const focused = useResearchSideFocus((state) => state.focused)
  const name = project?.name ?? workspace?.name ?? 'Project'
  return (
    <nav aria-label={`${name} pages`} className="flex min-h-0 flex-1 flex-col items-center gap-1">
      <ResearchProjectSwitcher>
        <button
          type="button"
          aria-label={`${name}, switch project`}
          title={hostLabel ? `${name} · ${hostLabel}` : name}
          className={cn(
            'flex size-8 items-center justify-center rounded-lg outline-none transition-colors duration-(--duration-fast) hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent',
            focused && 'ring-1 ring-primary/60'
          )}
        >
          <ResearchComputeProjectDot color={project?.badgeColor ?? null} />
        </button>
      </ResearchProjectSwitcher>
      <span aria-hidden className="my-1 h-px w-6 bg-worktree-sidebar-border" />
      {RAIL_PAGES.map(({ view, label, Icon }) => (
        <RailButton
          key={view}
          label={label}
          current={railCurrent(activeView, view)}
          onClick={() => openResearchView(view)}
        >
          <Icon aria-hidden />
        </RailButton>
      ))}
      <span className="mt-auto" />
      <RailButton label="Show full sidebar" onClick={toggleResearchSideSidebar}>
        <PanelLeftOpen aria-hidden />
      </RailButton>
      <RailButton
        label={`Close ${name}`}
        onClick={() => void window.api.researchWindow.sideCommand({ kind: 'close' })}
      >
        <X aria-hidden />
      </RailButton>
    </nav>
  )
}

/**
 * A project side's sidebar, the main window's for its own project: name and switcher, Workbench
 * with its chats, Experiments, Writing, Figures, Rebuttal, Library and the workspace. It folds to
 * icons by hand, or by itself when the side is narrow.
 */
export function ResearchSideSidebar(): React.JSX.Element {
  const collapsed = useResearchSideSidebarCollapsed()
  const settings = useAppStore((state) => state.settings)
  const systemPrefersDark = useSystemPrefersDark()
  const style = useMemo(
    () => resolveLeftSidebarStyleVariables(settings, systemPrefersDark),
    [settings, systemPrefersDark]
  )
  return (
    <aside
      aria-label="Project sidebar"
      data-research-side-sidebar={collapsed ? 'icons' : 'full'}
      className={cn(
        'left-sidebar-tokens scrollbar-sleek-parent flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[14px] bg-worktree-sidebar text-worktree-sidebar-foreground',
        collapsed ? 'w-12 py-2' : 'w-[220px]'
      )}
      style={style}
    >
      {collapsed ? (
        <ResearchSideRail />
      ) : (
        <>
          <ResearchNavigation />
          <ResearchWorkspaceShortcut />
        </>
      )}
    </aside>
  )
}
