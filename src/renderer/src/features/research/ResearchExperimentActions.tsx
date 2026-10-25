import { Archive, MoreHorizontal, Plus } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

type Props = {
  workspaceId: string | null
  actionsHost: HTMLElement | null
  hasArchived: boolean
  showArchived: boolean
  onShowArchivedChange: (value: boolean) => void
  onCreate: () => void
}

export function ResearchExperimentActions({
  workspaceId,
  actionsHost,
  hasArchived,
  showArchived,
  onShowArchivedChange,
  onCreate
}: Props): React.JSX.Element | null {
  if (!actionsHost) {
    return null
  }
  return createPortal(
    <div className="flex items-center gap-1">
      {hasArchived ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label="Experiment options">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onShowArchivedChange(!showArchived)}>
              <Archive aria-hidden />
              {showArchived ? 'Hide archived' : 'Show archived'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Create experiment"
        title="New experiment"
        disabled={!workspaceId}
        onClick={onCreate}
      >
        <Plus aria-hidden />
      </Button>
    </div>,
    actionsHost
  )
}
