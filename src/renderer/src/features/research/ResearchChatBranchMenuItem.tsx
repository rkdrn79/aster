import { GitBranch } from 'lucide-react'
import type { Tab } from '../../../../shared/tab-types'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { branchResearchChatTab } from './research-chat-branch-actions'
import { researchChatBranchAgentBlock } from './research-chat-branch-copy'

/** Branch chat in a chat list's ⋯ menu: a new chat with the whole conversation, opened where
 *  `open` opens chats (by default the Workbench, or a project window's Chats). */
export function ResearchChatBranchMenuItem({
  tab,
  open
}: {
  tab: Tab
  open?: (sessionId: string) => void
}): React.JSX.Element | null {
  if (tab.contentType !== 'agent-session' || !tab.agentSessionAgent) {
    return null
  }
  const blocked = researchChatBranchAgentBlock(tab.agentSessionAgent)
  return (
    <DropdownMenuItem disabled={Boolean(blocked)} onSelect={() => branchResearchChatTab(tab, open)}>
      <GitBranch aria-hidden />
      <span className="grid min-w-0">
        Branch chat
        <span className="text-xs whitespace-normal text-muted-foreground">
          {blocked ?? 'A new chat with this conversation; this one stays.'}
        </span>
      </span>
    </DropdownMenuItem>
  )
}
