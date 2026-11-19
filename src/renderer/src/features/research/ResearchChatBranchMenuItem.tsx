import { GitBranch, GitFork } from 'lucide-react'
import type { Tab } from '../../../../shared/tab-types'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { nativeChatBranchLabels } from '@/components/native-chat/NativeChatBranchAction'
import { branchResearchChatTab } from './research-chat-branch-actions'
import { researchChatBranchAgentBlock } from './research-chat-branch-copy'

/** Branch chat and Fork to background in a chat list's ⋯ menu: the whole conversation copied, and
 *  for a branch, opened where `open` opens chats (by default the Workbench, or a project window's
 *  Chats); a fork stays in the background. */
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
  const labels = nativeChatBranchLabels()
  const row = (kind: 'branch' | 'fork') => (
    <DropdownMenuItem
      key={kind}
      disabled={Boolean(blocked)}
      onSelect={() => branchResearchChatTab(tab, open, { kind })}
    >
      {kind === 'branch' ? <GitBranch aria-hidden /> : <GitFork aria-hidden />}
      <span className="grid min-w-0">
        {kind === 'branch' ? labels.branchChat : labels.forkChat}
        <span className="text-xs whitespace-normal text-muted-foreground">
          {blocked ?? (kind === 'branch' ? labels.branchChatHint : labels.forkChatHint)}
        </span>
      </span>
    </DropdownMenuItem>
  )
  return (
    <>
      {row('branch')}
      {row('fork')}
    </>
  )
}
