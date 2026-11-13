import { useContext, useMemo } from 'react'
import { ChevronDown, GitBranch } from 'lucide-react'
import { toast } from 'sonner'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { NativeChatBranchNavigationContext } from '@/components/native-chat/native-chat-branch-context'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { openResearchChatHere } from './research-chat-branch-run'
import { useResearchChatBranchLineage } from './use-research-chat-branch-lineage'

/** A quiet line over a chat that has branch relatives: where it was branched from, which opens
 *  that chat, and its own branches. Nothing for a chat with none. */
export function ResearchChatBranchBar({
  sessionId,
  target,
  workspaceId
}: {
  sessionId: string
  target: RuntimeClientTarget
  workspaceId: string | null | undefined
}): React.JSX.Element | null {
  const navigation = useContext(NativeChatBranchNavigationContext)
  const hostId = executionHostIdForStructuredTarget(target)
  const scope = useMemo(() => (workspaceId ? { hostId, workspaceId } : null), [hostId, workspaceId])
  const { parent, branches } = useResearchChatBranchLineage(scope, sessionId)
  // A pane that lists the family itself shows the branches there.
  const showBranches = !navigation?.switcher && branches.length > 0
  if (!scope || (!parent && !showBranches)) {
    return null
  }
  const open = (id: string): void => {
    if (navigation) {
      navigation.open(id)
    } else if (!openResearchChatHere(scope, id)) {
      toast.error('That chat is closed, so it cannot be opened from here.')
    }
  }
  return (
    <div
      data-native-chat-branch-bar=""
      className="flex min-h-7 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs text-muted-foreground"
    >
      {parent ? (
        <span className="flex min-w-0 items-center gap-1">
          <GitBranch className="size-3 shrink-0" aria-hidden />
          <span className="shrink-0">Branched from</span>
          <button
            type="button"
            className="min-w-0 truncate rounded-sm font-medium text-foreground/80 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`Open ${parent.label}`}
            onClick={() => open(parent.sessionId)}
          >
            {parent.shortLabel}
          </button>
          {parent.messageNumber > 0 ? (
            <span className="shrink-0 tabular-nums">· message {parent.messageNumber}</span>
          ) : null}
        </span>
      ) : null}
      {showBranches ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" className="ml-auto">
              Branches ({branches.length})
              <ChevronDown className="size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-72">
            {branches.map((branch) => (
              <DropdownMenuItem key={branch.sessionId} onSelect={() => open(branch.sessionId)}>
                <GitBranch aria-hidden />
                <span className="min-w-0 truncate" title={branch.label}>
                  {branch.shortLabel}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
