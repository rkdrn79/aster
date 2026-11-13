import { useLayoutEffect, useMemo, useRef } from 'react'
import { Check, ChevronDown, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { NativeChatBranchNavigation } from '@/components/native-chat/native-chat-branch-context'
import { cn } from '@/lib/utils'
import type { ResearchChatScope } from './research-chat-branches'
import { useResearchChatBranchLineage } from './use-research-chat-branch-lineage'

const INDENT = ['', 'pl-3', 'pl-6'] as const

/** A pane's chat navigation for branches: opening one binds it to the pane's subject. Its identity
 *  holds while `open` changes, so the chat's rows keep theirs. */
export function useResearchPaneBranchNavigation(
  open: (sessionId: string) => void
): NativeChatBranchNavigation {
  const latest = useRef(open)
  useLayoutEffect(() => {
    latest.current = open
  })
  return useMemo(() => ({ switcher: true, open: (sessionId) => latest.current(sessionId) }), [])
}

/** The compact switcher a subject's pane shows when its chat has branches: the whole family, the
 *  first chat first, and the one the subject is bound to checked. */
export function ResearchChatBranchSwitcher({
  scope,
  sessionId,
  onSwitch
}: {
  scope: ResearchChatScope | null
  sessionId: string
  onSwitch: (sessionId: string) => void
}): React.JSX.Element | null {
  const { family } = useResearchChatBranchLineage(scope, sessionId)
  if (family.length < 2) {
    return null
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          className="shrink-0"
          aria-label={`Branches of this chat (${family.length})`}
          title="Switch to another branch of this chat"
        >
          <GitBranch className="size-3.5" aria-hidden />
          <span className="tabular-nums">{family.length}</span>
          <ChevronDown className="size-3" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-72">
        <DropdownMenuLabel>Branches</DropdownMenuLabel>
        {family.map((entry) => (
          <DropdownMenuItem key={entry.sessionId} onSelect={() => onSwitch(entry.sessionId)}>
            <span
              className={cn('min-w-0 flex-1 truncate', INDENT[Math.min(entry.depth, 2)])}
              title={entry.label}
            >
              {entry.shortLabel}
            </span>
            {entry.sessionId === sessionId ? <Check className="size-3" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
