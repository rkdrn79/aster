import { Columns2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { useAppStore } from '@/store'
import { selectResearchInsideProject } from './research-navigation'
import { toggleResearchProjectSwitcher } from './research-project-switcher-store'
import { canOpenResearchSides } from './research-split-open'
import { researchWindowSideId } from './research-window-surface'

/**
 * The page header's way to put another project beside this one. In a side it asks the main
 * window, which owns the split; a pop-out project window shows one project and has none.
 */
export function ResearchSplitButton(): React.JSX.Element | null {
  const shortcut = useShortcutLabel('research.split.openBeside')
  const sideId = researchWindowSideId()
  // Why only inside a project: Home already lists every project, each with "Open to the Side".
  const insideProject = useAppStore(selectResearchInsideProject)
  if (!sideId && (!canOpenResearchSides() || !insideProject)) {
    return null
  }
  const label = 'Open a project to the side'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          data-research-split-button=""
          className="shrink-0 [-webkit-app-region:no-drag]"
          onClick={() => {
            if (sideId) {
              void window.api.researchWindow.sideCommand({ kind: 'open-beside' })
            } else {
              toggleResearchProjectSwitcher('beside')
            }
          }}
        >
          <Columns2 aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{shortcut ? `${label} (${shortcut})` : label}</TooltipContent>
    </Tooltip>
  )
}
