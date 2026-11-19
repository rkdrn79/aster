import { useState } from 'react'
import { ArrowRight, Ellipsis, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { TruncatedSidebarLabel } from '@/components/sidebar/truncated-sidebar-label'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { cn } from '@/lib/utils'
import { enterResearchWorkspace } from './research-navigation'
import type { ResearchHomeProject } from './research-home-projects'
import { researchHomeNeedsYou, type ResearchHomeActivity } from './research-home-activity'
import {
  ResearchProjectMenuItems,
  useResearchFolderProjectRemoval,
  useResearchProjectRename
} from './research-home-project-actions'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { ResearchSlackProjectDialog } from './ResearchSlackProjectDialog'
import { ResearchWandbProjectDialog } from './ResearchWandbProjectDialog'
import { RAISED_CARD, STEP_ON_HOVER } from './research-surface-classes'

const WORKSPACES_SHOWN = 4

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "3 experiments · 1 running · 2 need you · 2h ago"; zero counts other than experiments stay out. */
export function researchHomeActivityParts(
  activity: ResearchHomeActivity,
  now: number
): { text: string; tone: 'muted' | 'running' | 'attention' }[] {
  const needsYou = researchHomeNeedsYou(activity)
  const age = activity.lastActivityAt > 0 ? formatShortTimeAgo(activity.lastActivityAt, now) : null
  return [
    {
      text: activity.experiments
        ? plural(activity.experiments, 'experiment', 'experiments')
        : 'No experiments yet',
      tone: 'muted' as const
    },
    ...(activity.running
      ? [{ text: `${activity.running} running`, tone: 'running' as const }]
      : []),
    ...(needsYou
      ? [
          {
            text: `${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you`,
            tone: 'attention' as const
          }
        ]
      : []),
    ...(age ? [{ text: age === 'now' ? 'active now' : `${age} ago`, tone: 'muted' as const }] : [])
  ]
}

export function ResearchProjectCard({
  project,
  activity,
  now
}: {
  project: ResearchHomeProject
  activity: ResearchHomeActivity
  now: number
}): React.JSX.Element {
  const [primary] = project.workspaces
  const others = project.workspaces.slice(1, WORKSPACES_SHOWN)
  const hidden = project.workspaces.length - 1 - others.length
  const rename = useResearchProjectRename(project)
  const removeFolderProject = useResearchFolderProjectRemoval(project)
  const [slackOpen, setSlackOpen] = useState(false)
  const [wandbOpen, setWandbOpen] = useState(false)
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null)
  const parts = researchHomeActivityParts(activity, now)

  return (
    <div
      className={cn(RAISED_CARD, STEP_ON_HOVER, 'group/project relative')}
      onContextMenu={(event) => {
        // Why: React bubbles events out of portals; the open menu or rename dialog keeps its own.
        if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
          return
        }
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        setContextPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
      }}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          others.length > 0 ? 'rounded-t-xl' : 'rounded-xl'
        )}
        onClick={() => enterResearchWorkspace(primary)}
      >
        <span className="min-w-0 flex-1">
          {/* Why: only the title row shares its line with the menu and arrow at the top right. */}
          <span className="flex items-center gap-2 pr-16">
            <span className="flex w-3 shrink-0 justify-center">
              <ResearchComputeProjectDot color={project.badgeColor} />
            </span>
            <TruncatedSidebarLabel
              text={project.name}
              className="text-[15px] font-medium"
              tooltipSide="top"
            />
          </span>
          {/* Counts are quiet meta text; colour marks only what is running or waits on you. */}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 pl-5 text-xs text-muted-foreground tabular-nums">
            {parts.map((part, index) => (
              <span
                key={part.text}
                className={cn(
                  'inline-flex items-center gap-1 whitespace-nowrap',
                  part.tone === 'running' && 'text-foreground',
                  part.tone === 'attention' && 'text-status-warning'
                )}
              >
                {index > 0 ? <span aria-hidden>·</span> : null}
                {part.tone === 'running' ? (
                  <span aria-hidden className="size-1.5 rounded-full bg-status-success" />
                ) : null}
                {part.text}
              </span>
            ))}
          </span>
        </span>
      </button>
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${project.name}`}>
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <ResearchProjectMenuItems
              project={project}
              onRename={rename.open}
              onSlack={() => setSlackOpen(true)}
              onWandb={() => setWandbOpen(true)}
              onRemoveFolderProject={removeFolderProject.open}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <ArrowRight
          className="pointer-events-none size-4 text-muted-foreground transition-transform duration-(--duration-fast) ease-out-quint group-hover/project:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </div>
      <DropdownMenu
        modal={false}
        open={contextPoint !== null}
        onOpenChange={(open) => {
          if (!open) {
            setContextPoint(null)
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none absolute size-px opacity-0"
            style={contextPoint ? { left: contextPoint.x, top: contextPoint.y } : undefined}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <ResearchProjectMenuItems
            project={project}
            onRename={rename.open}
            onSlack={() => setSlackOpen(true)}
            onWandb={() => setWandbOpen(true)}
            onRemoveFolderProject={removeFolderProject.open}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {others.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-3 pb-3 pl-7">
          {others.map((workspace) => (
            <Button
              key={workspace.id}
              size="xs"
              variant="ghost"
              className="max-w-full"
              title={workspace.branch ?? workspace.name}
              onClick={() => enterResearchWorkspace(workspace)}
            >
              <GitBranch className="text-muted-foreground" aria-hidden />
              <span className="truncate text-muted-foreground">{workspace.name}</span>
            </Button>
          ))}
          {hidden > 0 ? (
            <span className="self-center px-1 text-xs text-muted-foreground">+{hidden}</span>
          ) : null}
        </div>
      ) : null}
      {rename.dialog}
      {removeFolderProject.dialog}
      <ResearchSlackProjectDialog project={project} open={slackOpen} onOpenChange={setSlackOpen} />
      <ResearchWandbProjectDialog project={project} open={wandbOpen} onOpenChange={setWandbOpen} />
    </div>
  )
}
