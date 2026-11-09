import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ProjectedAgentMenuItems } from '@/components/tab-bar/QuickLaunchButton'
import { useNewTabAgentMenuRows } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import type { NewTabAgentMenuRow } from '@/lib/new-tab-agent-menu-rows'
import type { TuiAgent } from '../../../../shared/tui-agent'

type PickerItemsProps = {
  workspaceId: string
  disabled?: boolean
  /** The pane's own launcher, so each pane keeps binding the chat it starts. */
  onPick: (agent: TuiAgent) => void
}

/**
 * The chat agents the Workbench's New conversation menu offers for this workspace, with the same
 * labels, icons and "not available as chat" reasons; picking one calls the pane's launcher.
 */
export function ResearchAgentPickerMenuItems({
  workspaceId,
  disabled,
  onPick
}: PickerItemsProps): React.JSX.Element {
  const detectionTarget = useAgentDetectionTargetForWorktree(workspaceId)
  const model = useNewTabAgentMenuRows(workspaceId, true, detectionTarget)
  const runLaunch = useCallback(
    (row: NewTabAgentMenuRow) => {
      if (row.kind === 'chat') {
        onPick(row.agent)
      }
    },
    [onPick]
  )
  return (
    <ProjectedAgentMenuItems chatOnly disabled={disabled} model={model} runLaunch={runLaunch} />
  )
}

/** A button that opens the agent list; the rows load when it opens. */
export function ResearchAgentPicker({
  workspaceId,
  disabled,
  onPick,
  label,
  children,
  size = 'sm',
  variant = 'outline',
  align = 'center',
  className
}: PickerItemsProps & {
  label: string
  children: React.ReactNode
  size?: 'xs' | 'sm'
  variant?: 'outline' | 'ghost'
  align?: 'start' | 'center' | 'end'
  className?: string
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} disabled={disabled} className={className}>
          {children}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <ResearchAgentPickerMenuItems workspaceId={workspaceId} onPick={onPick} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
