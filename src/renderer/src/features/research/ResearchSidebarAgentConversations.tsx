import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Plus } from 'lucide-react'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { Tab } from '../../../../shared/tab-types'
import { libraryScopeKey } from '../../../../shared/research/research-library'
import { conversationExperiment } from '../../../../shared/research/research-conversation-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
import { selectWritingOwner } from './research-writing-project'
import { researchConversationHome } from './research-conversation-home'

const NO_TABS: Tab[] = []

export function ResearchSidebarAgentConversations({
  kind
}: {
  kind: 'writing' | 'library'
}): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const tabs = useAppStore((state) =>
    context.workspaceId ? (state.unifiedTabsByWorktree[context.workspaceId] ?? NO_TABS) : NO_TABS
  )
  const records = useResearchRecords((state) => state.document)
  const library = useResearchLibrary((state) => state.document)
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
  const sessionId =
    kind === 'writing'
      ? experiment?.writingAgentSessionId
      : scope
        ? library?.readingAgentSessionByScope[scopeKey ?? '']
        : undefined
  const dedicatedTabs = context.hostId
    ? researchChatSessionTabs(useAppStore.getState(), tabs, context.hostId)
        .filter((entry) => {
          const home = researchConversationHome(
            records,
            library,
            context.hostId,
            context.workspaceId ?? '',
            entry.entityId
          )
          return kind === 'library'
            ? home.kind === 'library'
            : home.kind === 'writing' && home.experimentId === experiment?.id
        })
        .sort(
          (first, second) =>
            Number(second.entityId === sessionId) - Number(first.entityId === sessionId)
        )
    : []
  const boundTab = dedicatedTabs.find((entry) => entry.entityId === sessionId)

  useEffect(() => {
    void useResearchRecords.getState().load()
    void useResearchLibrary.getState().load()
  }, [])

  function openAgent(): void {
    if (kind === 'writing' && experiment) {
      requestWritingAgentFocus(experiment.id)
      openResearchView('research-writing')
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
        kind === 'writing' && experiment
          ? await launchWritingAgent(experiment, agent)
          : kind === 'library' && scope
            ? await launchReadingChat(scope, agent)
            : 'Choose a workspace and Experiment first.'
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
      if (kind === 'writing' && experiment) {
        await bindWritingAgentSession(experiment, tab.entityId)
      } else if (kind === 'library' && scope) {
        await bindReadingSession(scope, tab.entityId)
      }
      setError(null)
      openAgent()
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
          {kind === 'writing' && !experiment
            ? 'Choose an Experiment to start writing.'
            : kind === 'writing'
              ? 'No writing chat yet.'
              : 'No reading chat yet.'}
        </p>
      )}
      {(kind === 'writing' ? Boolean(experiment) : Boolean(scope)) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" className="w-full justify-start" disabled={launching}>
              <Plus aria-hidden /> {boundTab ? 'New agent chat' : 'Start agent chat'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => void launch('claude')}>Claude Code</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void launch('codex')}>Codex</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
