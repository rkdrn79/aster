import { useEffect } from 'react'
import { create } from 'zustand'
import { PanelLeftClose, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ResearchHomeProject } from './research-home-projects'
import { ResearchProjectRowMenu } from './ResearchProjectRowMenu'
import { ResearchProjectSwitcher, ResearchProjectSwitcherButton } from './ResearchProjectSwitcher'
import { MAIN_COLUMN } from './research-split-layout'
import { closeResearchSplitMainColumn } from './research-split-open'
import { useResearchSplit } from './research-split-store'
import { toggleResearchSideSidebar } from './research-side-sidebar'
import { researchWindowSideId } from './research-window-surface'

/** Whether the main window gave this side the keyboard; it alone knows which column has it. */
export const useResearchSideFocus = create<{ focused: boolean }>(() => ({ focused: false }))

/** Follows the main window's word on this side's focus; nothing in a pop-out window. */
export function useFollowResearchSideFocus(sideId: string | null): void {
  useEffect(() => {
    if (!sideId) {
      return
    }
    return window.api.researchWindow.onSideFocused((focused) => {
      useResearchSideFocus.setState({ focused: focused === true })
    })
  }, [sideId])
}

/** The line beside the name of the project whose column has the keyboard. */
export function ResearchColumnFocusMark({ shown }: { shown: boolean }): React.JSX.Element | null {
  return shown ? (
    <span
      aria-hidden
      data-research-column-focus=""
      className="absolute inset-y-1.5 -left-2 w-0.5 rounded-full bg-primary"
    />
  ) : null
}

function CloseColumnButton({
  label,
  onClose
}: {
  label: string
  onClose: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A side's top rows: where the main column has "Projects", the sidebar's fold and the side's
 * close; then the name with its own switcher (another project replaces this side).
 */
function SideProjectRow({ project }: { project: ResearchHomeProject }): React.JSX.Element {
  const focused = useResearchSideFocus((state) => state.focused)
  return (
    <>
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Show sidebar as icons"
              onClick={toggleResearchSideSidebar}
            >
              <PanelLeftClose aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Show sidebar as icons</TooltipContent>
        </Tooltip>
        <CloseColumnButton
          label={`Close ${project.name}`}
          onClose={() => void window.api.researchWindow.sideCommand({ kind: 'close' })}
        />
      </div>
      <div className="relative flex min-w-0 items-center">
        <ResearchColumnFocusMark shown={focused} />
        <ResearchProjectSwitcher>
          <ResearchProjectSwitcherButton project={project} />
        </ResearchProjectSwitcher>
      </div>
    </>
  )
}

/** The main column's name row; beside other projects it also marks focus and can close. */
function MainProjectRow({ project }: { project: ResearchHomeProject }): React.JSX.Element {
  const split = useResearchSplit((state) => state.sides.length > 0)
  const focused = useResearchSplit((state) => state.focused === MAIN_COLUMN)
  return (
    <div className="relative">
      <ResearchColumnFocusMark shown={split && focused} />
      <ResearchProjectRowMenu project={project} showTrigger className="gap-1">
        <ResearchProjectSwitcher>
          <ResearchProjectSwitcherButton project={project} />
        </ResearchProjectSwitcher>
        {split ? (
          <CloseColumnButton
            label={`Close ${project.name}`}
            onClose={closeResearchSplitMainColumn}
          />
        ) : null}
      </ResearchProjectRowMenu>
    </div>
  )
}

/** The open project's name at the top of a project sidebar, in the main window or a side. */
export function ResearchNavigationProjectRow({
  project
}: {
  project: ResearchHomeProject
}): React.JSX.Element {
  return researchWindowSideId() ? (
    <SideProjectRow project={project} />
  ) : (
    <MainProjectRow project={project} />
  )
}
