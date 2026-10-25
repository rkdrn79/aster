import { MessageSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { QuickLaunchAgentMenuItems } from '@/components/tab-bar/QuickLaunchButton'
import { useAppStore } from '@/store'

/** The Workbench before its first conversation: nothing runs until the user starts one. */
export function ResearchWorkbenchEmptyState({
  worktreeId,
  groupId
}: {
  worktreeId: string
  groupId: string
}): React.JSX.Element {
  const focus = (tabId: string): void => {
    useAppStore.getState().activateTab(tabId, { worktreeId })
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <MessageSquare className="size-6" aria-hidden />
      </div>
      <p className="text-sm font-medium">No conversations yet</p>
      <p className="max-w-sm text-balance text-xs text-muted-foreground">
        Start a conversation to work on this project&apos;s code with an agent. No agent runs until
        you do.
      </p>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus aria-hidden /> New conversation
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-72 max-w-[calc(100vw-1rem)]">
          <QuickLaunchAgentMenuItems
            worktreeId={worktreeId}
            groupId={groupId}
            chatOnly
            onFocusChat={focus}
            onFocusTerminal={focus}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
