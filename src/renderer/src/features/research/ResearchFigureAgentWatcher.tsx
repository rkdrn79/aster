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
import { useResearchRecords } from './research-records-store'
import { watchFigureTurnEnds } from './research-figure-turn-settle'
import { noteFigureAgentStatus } from './research-figure-turn'
import { figuresAgentSessionId, type FiguresAgentScope } from './research-figures-agent-session'

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
    noteFigureAgentStatus({ status, toolName, toolInput, turnOutcome })
  }, [status, toolName, toolInput, turnOutcome])
  return null
}

/**
 * Follows the project's Figure chat for the canvas: its status moves the tracked turn's phase, and
 * each turn's end is settled once (turn bar, History). Renders nothing.
 */
export function ResearchFigureAgentWatcher({
  scope
}: {
  scope: FiguresAgentScope
}): React.JSX.Element | null {
  const sessionId = useResearchRecords((state) => figuresAgentSessionId(state.document, scope))
  const tabs = useAppStore((state) => state.unifiedTabsByWorktree[scope.workspaceId] ?? NO_TABS)
  const owner = useMemo(() => {
    const state = useAppStore.getState()
    const tab = researchChatSessionTabs(state, tabs, scope.hostId).find(
      (entry) => entry.entityId === sessionId
    )
    return tab ? structuredAgentSessionOwnerForTab(state, tab) : null
  }, [tabs, scope.hostId, sessionId])
  const target = useMemo(() => structuredAgentSessionTargetForHost(owner), [owner])
  useEffect(() => watchFigureTurnEnds(), [])
  return sessionId && target ? (
    <StatusFeed key={sessionId} sessionId={sessionId} target={target} />
  ) : null
}
