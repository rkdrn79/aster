import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Plus } from 'lucide-react'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { Tab } from '../../../../shared/tab-types'
import { libraryScopeKey } from '../../../../shared/research/research-library'
import { conversationExperiment } from '../../../../shared/research/research-conversation-context'
import { ResearchAgentPicker } from './ResearchAgentPicker'
import { useAppStore } from '@/store'
import { researchChatSessionTabs } from './ResearchAgentChatPane'
import { ResearchConversationRow } from './ResearchConversationRow'
import { linkResearchConversation } from './research-conversation-link'
import { requestLibraryAgentFocus } from './research-library-agent-focus'
import { bindReadingSession, launchReadingChat } from './research-library-reading-agent'
import { useResearchLibrary } from './research-library-store'
import { openResearchView } from './research-navigation'
import { useResearchRecords } from './research-records-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { requestWritingAgentFocus } from './research-writing-agent-focus'
import { bindWritingAgentSession, launchWritingAgent } from './research-writing-agent-session'
import { projectWritingRecordId, selectWritingOwner } from './research-writing-project'
import { researchConversationHome, writingAgentScopeKey } from './research-conversation-home'
import {
  bindRebuttalAgentSession,
  launchRebuttalAgent,
  rebuttalAgentSessionId
} from './research-rebuttal-agent-session'
import { rebuttalReviewerSessionIds } from './research-rebuttal-reviewer-session'
import {
  bindFigureAgentSession,
  figureAgentSessionId,
  figureOfChat,
  launchFigureAgent
} from './research-figures-agent-session'
import { openFigureSlug, useResearchFigures } from './research-figures-store'
import { openProjectAgentPage } from './research-project-agent-page'

const NO_TABS: Tab[] = []

export function ResearchSidebarAgentConversations({
  kind
}: {
  kind: 'writing' | 'figures' | 'rebuttal' | 'library'
}): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const tabs = useAppStore((state) =>
    context.workspaceId ? (state.unifiedTabsByWorktree[context.workspaceId] ?? NO_TABS) : NO_TABS
  )
  const records = useResearchRecords((state) => state.document)
  const library = useResearchLibrary((state) => state.document)
  // Why subscribe: the Figures section's "New agent chat" depends on the open figure.
  useResearchFigures((state) => state.selected)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Why the owner: Writing is project-wide, so its chat never follows the selected Experiment.
  const experiment =
    selectWritingOwner(records, { hostId: context.hostId, workspaceId: context.workspaceId }) ??
    undefined
  const experiments =
    records?.experiments.filter(
      (entry) =>
        entry.workspaceId === context.workspaceId &&
        entry.hostId === context.hostId &&
        !entry.archived
    ) ?? []
  const scope =
    context.workspaceId && context.workspacePath && context.hostId
      ? {
          workspaceId: context.workspaceId,
          workspacePath: context.workspacePath,
          hostId: context.hostId
        }
      : null
  const scopeKey = scope ? libraryScopeKey(scope) : null
  const figureSlug = kind === 'figures' && scope ? openFigureSlug(scope) : null
  const sessionId =
    kind === 'writing'
      ? scope
        ? (records?.writingAgentSessionByScope[writingAgentScopeKey(scope)] ??
          experiment?.writingAgentSessionId)
        : undefined
      : kind === 'rebuttal' || kind === 'figures'
        ? scope
          ? kind === 'rebuttal'
            ? rebuttalAgentSessionId(records, scope)
            : figureAgentSessionId(records, scope, figureSlug)
          : undefined
        : scope
          ? library?.readingAgentSessionByScope[scopeKey ?? '']
          : undefined
  const reviewerSessions = new Set(
    kind === 'rebuttal' && scope ? rebuttalReviewerSessionIds(records, scope) : []
  )
  const dedicatedTabs = context.hostId
    ? researchChatSessionTabs(useAppStore.getState(), tabs, context.hostId).filter((entry) => {
        const home = researchConversationHome(
          records,
          library,
          context.hostId,
          context.workspaceId ?? '',
          entry.entityId
        )
        // Why no sort: picking a chat binds it, and moving the bound one up reordered the list
        // on every click; the list keeps the tabs' own order and marks the bound chat instead.
        // Why exclude reviewer chats: picking one here would make a simulation the author agent.
        return home.kind === kind && !reviewerSessions.has(entry.entityId)
      })
    : []
  const boundTab = dedicatedTabs.find((entry) => entry.entityId === sessionId)

  useEffect(() => {
    void useResearchRecords.getState().load()
    void useResearchLibrary.getState().load()
  }, [])

  function openAgent(sessionToShow?: string): void {
    if (kind === 'writing' && scope) {
      requestWritingAgentFocus(projectWritingRecordId(scope))
      openResearchView('research-writing')
    } else if ((kind === 'rebuttal' || kind === 'figures') && scope) {
      openProjectAgentPage(kind, scope, sessionToShow)
    } else if (kind === 'library' && scope) {
      requestLibraryAgentFocus(libraryScopeKey(scope))
      openResearchView('research-library')
    }
  }

  async function launch(agent: TuiAgent): Promise<void> {
    if (launching) {
      return
    }
    setLaunching(true)
    setError(null)
    try {
      const failure =
        kind === 'writing' && scope
          ? await launchWritingAgent(scope, agent)
          : kind === 'rebuttal' && scope
            ? await launchRebuttalAgent(scope, agent)
            : kind === 'figures' && scope
              ? await launchFigureAgent(scope, openFigureSlug(scope), agent)
              : kind === 'library' && scope
                ? await launchReadingChat(scope, agent)
                : 'Choose a workspace first.'
      if (failure) {
        setError(failure)
      } else {
        openAgent()
      }
    } catch (cause) {
      setError(`Agent chat could not start. ${String(cause)}`)
    } finally {
      setLaunching(false)
    }
  }

  async function select(tab: Tab): Promise<void> {
    try {
      if (kind === 'writing' && scope) {
        await bindWritingAgentSession(scope, tab.entityId)
      } else if (kind === 'rebuttal' && scope) {
        await bindRebuttalAgentSession(scope, tab.entityId)
      } else if (kind === 'figures' && scope) {
        // Why: a figure's chat opens on that figure; a chat no figure holds joins the open one.
        if (!figureOfChat(records, scope, tab.entityId)) {
          await bindFigureAgentSession(scope, openFigureSlug(scope), tab.entityId)
        }
      } else if (kind === 'library' && scope) {
        await bindReadingSession(scope, tab.entityId)
      }
      setError(null)
      openAgent(kind === 'figures' ? tab.entityId : undefined)
    } catch (cause) {
      setError(`Conversation was not selected. ${String(cause)}`)
    }
  }

  async function link(tab: Tab, experimentId: string | null): Promise<void> {
    if (!context.workspaceId || !context.hostId) {
      return
    }
    try {
      await linkResearchConversation(
        { tabId: tab.id, workspaceId: context.workspaceId, hostId: context.hostId },
        experimentId
      )
      setError(null)
    } catch (cause) {
      setError(`Conversation was not linked. ${String(cause)}`)
    }
  }

  return (
    <div className="space-y-1 py-1">
      {dedicatedTabs.length && context.hostId ? (
        dedicatedTabs.map((tab) => (
          <ResearchConversationRow
            key={tab.id}
            tab={tab}
            hostId={context.hostId}
            active={false}
            linkedExperiment={
              records && context.workspaceId
                ? conversationExperiment(
                    records,
                    tab.id,
                    context.workspaceId,
                    context.hostId,
                    tab.entityId
                  )
                : null
            }
            experiments={experiments}
            onSelect={() => void select(tab)}
            onLink={(experimentId) => void link(tab, experimentId)}
          />
        ))
      ) : (
        <p className="px-2 text-xs text-muted-foreground">
          {kind === 'writing' && !scope
            ? 'Choose a project to start writing.'
            : kind === 'writing'
              ? 'No writing chat yet.'
              : kind === 'rebuttal'
                ? 'No rebuttal chat yet.'
                : kind === 'figures'
                  ? 'No figure chat yet.'
                  : 'No reading chat yet.'}
        </p>
      )}
      {scope ? (
        <ResearchAgentPicker
          workspaceId={scope.workspaceId}
          disabled={launching}
          label="Start a chat with"
          size="xs"
          variant="ghost"
          align="start"
          className="w-full justify-start"
          onPick={(agent) => void launch(agent)}
        >
          <Plus aria-hidden /> {boundTab ? 'New agent chat' : 'Start agent chat'}
        </ResearchAgentPicker>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
