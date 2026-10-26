import { useState } from 'react'
import { Ellipsis } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ResearchHomeProject } from './research-home-projects'
import {
  ResearchProjectMenuItems,
  useResearchFolderProjectRemoval,
  useResearchProjectRename
} from './research-home-project-actions'
import { ResearchSlackProjectDialog } from './ResearchSlackProjectDialog'

/** The Home card's project actions on a sidebar row: right-click it, or use its hover "⋯". */
export function ResearchProjectRowMenu({
  project,
  showTrigger,
  className,
  children
}: {
  project: ResearchHomeProject
  /** Rows that already carry a "⋯" keep right-click only. */
  showTrigger: boolean
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  const rename = useResearchProjectRename(project)
  const removeFolderProject = useResearchFolderProjectRemoval(project)
  const [slackOpen, setSlackOpen] = useState(false)
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null)
  return (
    <div
      className={cn('group relative flex min-w-0 items-center', className)}
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
      {children}
      {showTrigger ? (
        <span className="flex w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:opacity-100 focus-within:w-auto focus-within:opacity-100 has-[[data-state=open]]:w-auto has-[[data-state=open]]:opacity-100">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${project.name}`}>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ResearchProjectMenuItems
                project={project}
                onRename={rename.open}
                onSlack={() => setSlackOpen(true)}
                onRemoveFolderProject={removeFolderProject.open}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : null}
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
            onRemoveFolderProject={removeFolderProject.open}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {rename.dialog}
      {removeFolderProject.dialog}
      <ResearchSlackProjectDialog project={project} open={slackOpen} onOpenChange={setSlackOpen} />
    </div>
  )
}
