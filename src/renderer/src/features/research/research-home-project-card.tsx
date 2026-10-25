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
import { ResearchProjectMenuItems, useResearchProjectRename } from './research-home-project-actions'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import { ResearchSlackProjectDialog } from './ResearchSlackProjectDialog'

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
  const [slackOpen, setSlackOpen] = useState(false)
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null)
  const parts = researchHomeActivityParts(activity, now)

  return (
    <div
      className="relative rounded-lg border border-border bg-card"
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
          'flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          others.length > 0 ? 'rounded-t-lg' : 'rounded-lg'
        )}
        onClick={() => enterResearchWorkspace(primary)}
      >
        <span className="mt-1.5">
          <ResearchComputeProjectDot color={project.badgeColor} />
        </span>
        <span className="min-w-0 flex-1">
          {/* Why: only the title row shares its line with the menu and arrow at the top right. */}
          <span className="block pr-16">
            <TruncatedSidebarLabel
              text={project.name}
              className="text-base font-semibold"
              tooltipSide="top"
            />
          </span>
          {/* Why: each "·" leads its part; one starting a line lands in the clipped -ml-4. */}
          <span className="mt-1 block overflow-hidden">
            <span className="-ml-4 flex flex-wrap text-xs text-muted-foreground">
              {parts.map((part) => (
                <span
                  key={part.text}
                  className={cn(
                    'inline-flex whitespace-nowrap',
                    part.tone === 'running' && 'font-medium text-foreground',
                    part.tone === 'attention' && 'font-medium text-status-warning'
                  )}
                >
                  <span aria-hidden className="w-4 text-center font-normal text-muted-foreground">
                    ·
                  </span>
                  {part.text}
                </span>
              ))}
            </span>
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
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <ArrowRight className="pointer-events-none size-4 text-muted-foreground" aria-hidden />
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
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {others.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-t border-border px-3 py-2">
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
      <ResearchSlackProjectDialog project={project} open={slackOpen} onOpenChange={setSlackOpen} />
    </div>
  )
}
