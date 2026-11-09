import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Tab } from '../../../../shared/tab-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { useStructuredAgentSessionStatusSummary } from '@/components/native-chat/StructuredAgentSessionStatusBridge'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { useAppStore } from '@/store'
import { researchChatSessionTabs } from './ResearchAgentChatPane'
import { figureChatSessions } from './research-figure-chat-slots'
import { useResearchRecords } from './research-records-store'
import { lastAgentTurnFigure } from './research-figure-last-agent-turn'
import { watchFigureTurnEnds } from './research-figure-turn-settle'
import { useFigureTurn } from './research-figure-turn'
import { activeFigureTurnSessions, noteFigureAgentStatus } from './research-figure-turn-status'
import { adoptLegacyFigureChat, type FiguresAgentScope } from './research-figures-agent-session'
import { useResearchFigures } from './research-figures-store'

const NO_TABS: readonly Tab[] = []

function StatusFeed({
  sessionId,
  target
}: {
  sessionId: string
  target: RuntimeClientTarget
}): null {
  const { summary } = useStructuredAgentSessionStatusSummary(sessionId, target)
  const status = summary?.status ?? null
  const toolName = summary?.toolName
  const toolInput = summary?.toolInput
  const turnOutcome = summary?.turnOutcome
  useEffect(() => {
    noteFigureAgentStatus(sessionId, { status, toolName, toolInput, turnOutcome })
  }, [sessionId, status, toolName, toolInput, turnOutcome])
  return null
}

/**
 * Follows every Figure chat of the project (each figure's, and the old chat of a figure that moved
 * to a new one until its turn ends): each status moves that figure's tracked turn, and each turn's
 * end is settled once (turn bar, History). One small feed per chat; renders nothing.
 */
export function ResearchFigureAgentWatcher({
  scope
}: {
  scope: FiguresAgentScope
}): React.JSX.Element | null {
  const bound = useResearchRecords(useShallow((state) => figureChatSessions(state.document, scope)))
  const turning = useFigureTurn(useShallow((state) => activeFigureTurnSessions(state, scope)))
  const tabs = useAppStore((state) => state.unifiedTabsByWorktree[scope.workspaceId] ?? NO_TABS)
  const feeds = useMemo(() => {
    const state = useAppStore.getState()
    const chats = researchChatSessionTabs(state, tabs, scope.hostId)
    return [...new Set([...bound, ...turning])].flatMap((sessionId) => {
      const tab = chats.find((entry) => entry.entityId === sessionId)
      const target = tab
        ? structuredAgentSessionTargetForHost(structuredAgentSessionOwnerForTab(state, tab))
        : null
      return target ? [{ sessionId, target }] : []
    })
  }, [tabs, scope.hostId, bound, turning])
  const owner = useResearchFigures((state) => state.owner)
  const listing = useResearchFigures((state) => state.listing)
  useEffect(() => watchFigureTurnEnds(), [])
  useEffect(() => {
    if (owner && owner.workspaceId === scope.workspaceId) {
      void adoptLegacyFigureChat(
        scope,
        listing.figures.map((figure) => figure.slug),
        (slugs) => lastAgentTurnFigure(owner, slugs)
      ).catch(() => undefined)
    }
    // Why tabs too: the old chat's tab may appear only after the figures are listed.
  }, [owner, listing, scope, tabs])
  return (
    <>
      {feeds.map((feed) => (
        <StatusFeed key={feed.sessionId} sessionId={feed.sessionId} target={feed.target} />
      ))}
    </>
  )
}
