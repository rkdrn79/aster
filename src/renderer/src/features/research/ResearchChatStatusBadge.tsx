import { useMemo } from 'react'
import { Check } from 'lucide-react'
import type { Tab } from '../../../../shared/tab-types'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import { useStructuredAgentSessionStatusSummary } from '@/components/native-chat/StructuredAgentSessionStatusBridge'
import { structuredAgentSessionTargetForHost } from '@/runtime/structured-agent-session-owner'
import { cn } from '@/lib/utils'
import { useResearchRecords } from './research-records-store'
import { researchChatBranchOf, researchChatCopyKind } from './research-chat-branches'

export type ResearchChatLiveStatus = 'working' | 'needs-you' | 'done' | null

const WORDS = { working: 'Working', 'needs-you': 'Needs you', done: 'Done' } as const

/** What a background copy is doing, from its host's status feed: working, waiting on the person,
 *  or done with its last request. Null while it waits for its first prompt or its host is quiet. */
export function useResearchChatLiveStatus(
  sessionId: string,
  hostId: string | null
): ResearchChatLiveStatus {
  const target = useMemo(
    () => structuredAgentSessionTargetForHost(hostId) ?? { kind: 'local' as const },
    [hostId]
  )
  const { summary } = useStructuredAgentSessionStatusSummary(sessionId, target)
  if (!hostId || !summary?.status) {
    return null
  }
  if (summary.status === 'working') {
    return 'working'
  }
  if (summary.status === 'attention') {
    return 'needs-you'
  }
  return summary.turnOutcome ? 'done' : null
}

/** The status in words; `compact` (a narrow chat list) keeps only its mark, the words in its
 *  tooltip, so the chat's name keeps the room. */
export function ResearchChatStatusBadge({
  sessionId,
  hostId,
  compact = false,
  className
}: {
  sessionId: string
  hostId: string | null
  compact?: boolean
  className?: string
}): React.JSX.Element | null {
  const status = useResearchChatLiveStatus(sessionId, hostId)
  if (!status) {
    return null
  }
  return (
    <span
      data-research-chat-status={status}
      title={WORDS[status]}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground',
        status === 'needs-you' && 'text-foreground',
        className
      )}
    >
      {status === 'working' ? <AgentWorkingSpinner className="size-2.5" /> : null}
      {status === 'done' && compact ? <Check className="size-4" aria-hidden /> : null}
      {status === 'needs-you' && compact ? (
        <span className="size-1.5 rounded-full bg-foreground" aria-hidden />
      ) : null}
      <span className={compact ? 'sr-only' : undefined}>{WORDS[status]}</span>
    </span>
  )
}

/** The live status a chat list shows beside a fork; nothing for any other chat. */
export function ResearchChatForkStatus({
  tab,
  hostId
}: {
  tab: Pick<Tab, 'worktreeId' | 'entityId'>
  hostId: string | null
}): React.JSX.Element | null {
  const isFork = useResearchRecords((state) => {
    const branch = hostId
      ? researchChatBranchOf(state.document, { hostId, workspaceId: tab.worktreeId }, tab.entityId)
      : null
    return branch !== null && researchChatCopyKind(branch) === 'fork'
  })
  return isFork ? (
    <ResearchChatStatusBadge sessionId={tab.entityId} hostId={hostId} compact />
  ) : null
}
