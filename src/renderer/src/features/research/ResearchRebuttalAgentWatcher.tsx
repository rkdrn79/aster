import { useEffect, useMemo } from 'react'
import type { Tab } from '../../../../shared/tab-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { useStructuredAgentSessionStatusSummary } from '@/components/native-chat/StructuredAgentSessionStatusBridge'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { useAppStore } from '@/store'
import { researchChatSessionTabs } from './ResearchAgentChatPane'
import { rebuttalAgentSessionId, type RebuttalAgentScope } from './research-rebuttal-agent-session'
import { useResearchRecords } from './research-records-store'
import { reviewerAgentSessionId } from './research-rebuttal-reviewer-session'
import { noteRebuttalAgentStatus, type RebuttalActor } from './research-rebuttal-turns'

const NO_TABS: readonly Tab[] = []

function StatusFeed({
  actor,
  sessionId,
  target
}: {
  actor: RebuttalActor
  sessionId: string
  target: RuntimeClientTarget
}): null {
  const { summary } = useStructuredAgentSessionStatusSummary(sessionId, target)
  const status = summary?.status ?? null
  const turnOutcome = summary?.turnOutcome
  useEffect(() => {
    noteRebuttalAgentStatus(actor, { status, turnOutcome })
  }, [actor, status, turnOutcome])
  return null
}

/** Follows the author agent's and every reviewer agent's status at once. Renders nothing. */
export function ResearchRebuttalAgentWatcher({
  scope,
  slug,
  reviewerIds
}: {
  scope: RebuttalAgentScope
  slug: string
  reviewerIds: readonly string[]
}): React.JSX.Element | null {
  const records = useResearchRecords((state) => state.document)
  const tabs = useAppStore((state) => state.unifiedTabsByWorktree[scope.workspaceId] ?? NO_TABS)
  const sessions = useMemo(() => {
    const entries: { actor: RebuttalActor; sessionId: string }[] = []
    const author = rebuttalAgentSessionId(records, scope)
    if (author) {
      entries.push({ actor: 'author', sessionId: author })
    }
    for (const reviewerId of reviewerIds) {
      const sessionId = reviewerAgentSessionId(records, scope, slug, reviewerId)
      if (sessionId) {
        entries.push({ actor: `reviewer:${reviewerId}`, sessionId })
      }
    }
    return entries
  }, [records, scope, slug, reviewerIds])
  const state = useAppStore.getState()
  const chatTabs = researchChatSessionTabs(state, tabs, scope.hostId)
  return (
    <>
      {sessions.map(({ actor, sessionId }) => {
        const tab = chatTabs.find((entry) => entry.entityId === sessionId)
        const target = tab
          ? structuredAgentSessionTargetForHost(structuredAgentSessionOwnerForTab(state, tab))
          : null
        return target ? (
          <StatusFeed key={actor} actor={actor} sessionId={sessionId} target={target} />
        ) : null
      })}
    </>
  )
}
