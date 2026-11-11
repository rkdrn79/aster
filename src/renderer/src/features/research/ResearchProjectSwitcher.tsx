import { useMemo, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSidebarHostScopeOptions } from '@/components/sidebar/use-sidebar-host-scope-options'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { useAppStore } from '@/store'
import { getExecutionHostHealthLabel } from '../../../../shared/execution-host-health'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { KeybindingActionId } from '../../../../shared/keybindings'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { ResearchProjectSwitcherList } from './ResearchProjectSwitcherList'
import {
  isResearchHomePage,
  openResearchHome,
  selectResearchInsideProject
} from './research-navigation'
import {
  findResearchActiveProject,
  useResearchHomeProjects,
  type ResearchHomeProject
} from './research-home-projects'
import {
  canOpenResearchPageWindows,
  openResearchProjectInNewWindow
} from './research-page-window-open'
import { buildProjectSwitcherRows, type ResearchSwitcherHost } from './research-project-switcher'
import {
  closeResearchProjectSwitcherForNavigation,
  setResearchProjectSwitcherOpen,
  switchToResearchProject,
  takeResearchProjectSwitcherFocus,
  useResearchProjectSwitcher
} from './research-project-switcher-store'

function ShortcutRow({
  label,
  actionId
}: {
  label: string
  actionId: KeybindingActionId
}): React.JSX.Element | null {
  const [combo] = useShortcutKeyComboDetails(actionId)
  if (!combo) {
    return null
  }
  return (
    <>
      <span>{label}</span>
      <ShortcutKeyCombo
        keys={combo.keys}
        doubleTap={combo.doubleTap}
        className="gap-0.5 justify-self-end"
        keyCapClassName="min-w-0 border-background/20 bg-background/10 px-1 py-0 text-3xs text-background shadow-none"
        separatorClassName="text-3xs text-background/70"
      />
    </>
  )
}

/** The rows: every other project, most recent first, with a quiet name for remote hosts. */
function SwitcherPanel(): React.JSX.Element {
  const projects = useResearchHomeProjects()
  const insideProject = useAppStore(selectResearchInsideProject)
  const onHomeOverview = useAppStore(
    (state) => !selectResearchInsideProject(state) && !isResearchHomePage(state.activeView)
  )
  const workspaceId = useAppStore((state) => state.activeWorktreeId)
  const hostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const { hostOptions } = useSidebarHostScopeOptions()
  const rows = useMemo(() => {
    const current = insideProject
      ? findResearchActiveProject(projects, workspaceId, hostId).project
      : null
    const describeHost = (workspace: ResearchHomeProject['workspaces'][number]) => {
      const host = parseExecutionHostId(workspace.executionHostId)
      if (!host || host.kind === 'local') {
        return null
      }
      const option = hostOptions.find((entry) => entry.id === host.id)
      const reachable = !option || option.health === 'available' || option.health === 'local'
      const described: ResearchSwitcherHost = {
        label: option?.label ?? host.id,
        status: reachable ? null : getExecutionHostHealthLabel(option.health, option.blockedReason)
      }
      return described
    }
    return buildProjectSwitcherRows(projects, current?.key ?? null, describeHost)
  }, [hostId, hostOptions, insideProject, projects, workspaceId])

  return (
    <ResearchProjectSwitcherList
      rows={rows}
      canOpenWindows={canOpenResearchPageWindows()}
      showHome={!onHomeOverview}
      onSwitch={(row) => switchToResearchProject(row.workspace)}
      onOpenInNewWindow={(row) => {
        setResearchProjectSwitcherOpen(false)
        openResearchProjectInNewWindow(row.workspace)
      }}
      onHome={() => {
        closeResearchProjectSwitcherForNavigation()
        openResearchHome()
      }}
    />
  )
}

/**
 * The project switcher, opened from `children`: the open project's name in the sidebar, or (on
 * Home, `anchorOnly`) the spot it appears at when the shortcut opens it.
 */
export function ResearchProjectSwitcher({
  anchorOnly = false,
  children
}: {
  anchorOnly?: boolean
  children: React.ReactElement
}): React.JSX.Element {
  const open = useResearchProjectSwitcher((state) => state.open)
  const [hint, setHint] = useState(false)
  // Why: once used, the name keeps its tooltip to itself until the pointer or focus leaves it;
  // a pointer resting there, or focus coming back, is not a request for help.
  const [quiet, setQuiet] = useState(false)
  if (open && !quiet) {
    setQuiet(true)
  }
  const content = (
    <PopoverContent
      align="start"
      sideOffset={6}
      className="w-[min(22rem,calc(100vw-1rem))]"
      aria-label="Switch project"
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        const root = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
        root?.querySelector<HTMLInputElement>('[cmdk-input]')?.focus()
      }}
      onCloseAutoFocus={(event) => {
        // Why: after the shortcut, focus goes back where the user was typing, not to the sidebar.
        const focus = takeResearchProjectSwitcherFocus()
        if (focus !== 'trigger') {
          event.preventDefault()
        }
        if (focus instanceof HTMLElement) {
          focus.focus()
        }
      }}
    >
      <SwitcherPanel />
    </PopoverContent>
  )
  if (anchorOnly) {
    return (
      <Popover open={open} onOpenChange={setResearchProjectSwitcherOpen}>
        <PopoverAnchor asChild>{children}</PopoverAnchor>
        {content}
      </Popover>
    )
  }
  return (
    <Popover open={open} onOpenChange={setResearchProjectSwitcherOpen}>
      <Tooltip open={hint && !open && !quiet} onOpenChange={setHint}>
        <TooltipTrigger
          asChild
          onPointerLeave={() => setQuiet(false)}
          onBlur={() => setQuiet(false)}
        >
          <PopoverTrigger asChild>{children}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" sideOffset={4}>
          <span className="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-1">
            <ShortcutRow label="Switch project" actionId="research.projectSwitcher" />
            <ShortcutRow label="Previous project" actionId="research.previousProject" />
          </span>
        </TooltipContent>
      </Tooltip>
      {content}
    </Popover>
  )
}

/** The open project's name in the sidebar; clicking it opens the switcher. */
export function ResearchProjectSwitcherButton({
  project,
  ...props
}: { project: Pick<ResearchHomeProject, 'name' | 'badgeColor'> } & Omit<
  React.ComponentProps<'button'>,
  'children'
>): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={`${project.name}, switch project`}
      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-worktree-sidebar-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
      {...props}
    >
      <ResearchComputeProjectDot color={project.badgeColor} />
      <span className="min-w-0 flex-1 truncate text-base font-semibold">{project.name}</span>
      <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}
