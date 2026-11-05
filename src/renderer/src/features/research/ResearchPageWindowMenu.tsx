import { AppWindow } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { ResearchWindowPage } from '../../../../shared/research-page-window'
import {
  canOpenResearchPageWindows,
  openResearchPageInNewWindow
} from './research-page-window-open'

/** Right-click on a sidebar page row: the same new window a drag out of the window opens. */
export function ResearchPageWindowMenu({
  page,
  children
}: {
  page: ResearchWindowPage
  children: React.ReactElement
}): React.JSX.Element {
  if (!canOpenResearchPageWindows()) {
    return children
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => openResearchPageInNewWindow(page)}>
          <AppWindow aria-hidden />
          Open in New Window
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
