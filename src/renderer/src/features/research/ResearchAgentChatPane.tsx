import { useEffect, useMemo, useState } from 'react'
import { Check, GripVertical, Link2, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import type { Tab } from '../../../../shared/tab-types'
import { isStructuredTab } from '../../../../shared/structured-agent-session-tab'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { NativeChatPlaceholderContext } from '@/components/native-chat/native-chat-placeholder-context'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { RESEARCH_CONVERSATION_DRAG_TYPE } from './research-conversation-drag'
import { conversationExperiment } from '../../../../shared/research/research-conversation-context'
import { useResearchRecords } from './research-records-store'
import { linkResearchConversation } from './research-conversation-link'
import { useResearchLibrary } from './research-library-store'
import {
  researchChatAvailableForHome,
  researchConversationHome,
  type ResearchConversationHome
} from './research-conversation-home'
import { useDeleteResearchConversation } from './research-conversation-delete'
import { researchWindowSurfaceTarget } from './research-window-surface'
import { ResearchAgentPicker, ResearchAgentPickerMenuItems } from './ResearchAgentPicker'
import { NativeChatBranchNavigationContext } from '@/components/native-chat/native-chat-branch-context'
import {
  ResearchChatBranchSwitcher,
  useResearchPaneBranchNavigation
} from './ResearchChatBranchSwitcher'
import { ResearchChatBranchMenuItem } from './ResearchChatBranchMenuItem'

const EMPTY_TABS: readonly Tab[] = []
type ChatSessionTab = Tab & {
  contentType: 'agent-session'
  agentSessionAgent: NonNullable<Tab['agentSessionAgent']>
}

/** Structured chats in a workspace that the given host owns. */
export function researchChatSessionTabs(
  state: AppState,
  tabs: readonly Tab[],
  hostId: string
): ChatSessionTab[] {
  return tabs.filter((tab): tab is ChatSessionTab => {
    if (!isStructuredTab(tab) || !tab.agentSessionAgent) {
      return false
    }
    return structuredAgentSessionOwnerForTab(state, tab) === hostId
  })
}

export { launchResearchChat, type ResearchChatLaunchResult } from './research-chat-launch'

type ResearchAgentChatPaneProps = {
  workspaceId: string
  hostId: string
  boundSessionId: string | undefined
  home: Exclude<ResearchConversationHome, { kind: 'workbench' }>
  title: string
  sessionLabel: string
  emptyHint: React.ReactNode
  /** What the composer invites instead of the coding hint, e.g. "Describe a figure…". */
  composerPlaceholder?: string
  visible: boolean
  className?: string
  /** Shown between the header and the chat, e.g. quick prompts. */
  toolbar?: React.ReactNode
  onBind: (sessionId: string | null) => Promise<void>
  /** Resolves to an error message, or null once the new chat is bound. */
  onLaunch: (agent: TuiAgent) => Promise<string | null>
  /** Rewrites what the user types in the bound chat, e.g. to attach the page's context. */
  decorateMessage?: (sessionId: string, text: string) => string
  /** Chats that belong to another pane on this page, so they are not offered here. */
  excludeSessionIds?: ReadonlySet<string>
}

export function ResearchAgentChatPane({
  workspaceId,
  hostId,
  boundSessionId,
  home,
  title,
  sessionLabel,
  emptyHint,
  composerPlaceholder,
  visible,
  className,
  toolbar,
  onBind,
  onLaunch,
  decorateMessage,
  excludeSessionIds
}: ResearchAgentChatPaneProps): React.JSX.Element {
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleteConversation = useDeleteResearchConversation()
  const records = useResearchRecords((state) => state.document)
  const library = useResearchLibrary((state) => state.document)
  const workspaceTabs = useAppStore(
    (state) => state.unifiedTabsByWorktree[workspaceId] ?? EMPTY_TABS
  )
  const sessions = researchChatSessionTabs(useAppStore.getState(), workspaceTabs, hostId)
  const availableSessions = sessions.filter((tab) => {
    const placement = researchConversationHome(records, library, hostId, workspaceId, tab.entityId)
    return researchChatAvailableForHome(placement, home) && !excludeSessionIds?.has(tab.entityId)
  })
  const boundSession = sessions.find((tab) => tab.entityId === boundSessionId)
  const boundEntityId = boundSession?.entityId
  const decorateOutgoingText = useMemo(
    () =>
      decorateMessage && boundEntityId
        ? (text: string) => decorateMessage(boundEntityId, text)
        : undefined,
    [decorateMessage, boundEntityId]
  )

  useEffect(() => {
    void useResearchRecords.getState().load()
    void useResearchLibrary.getState().load()
  }, [])
  const experiments =
    records?.experiments.filter(
      (experiment) =>
        experiment.workspaceId === workspaceId &&
        experiment.hostId === hostId &&
        !experiment.archived
    ) ?? []
  const linkedExperiment =
    records && boundSession
      ? conversationExperiment(records, boundSession.id, workspaceId, hostId, boundSession.entityId)
      : null
  const sessionOwner = boundSession
    ? structuredAgentSessionOwnerForTab(useAppStore.getState(), boundSession)
    : null
  const sessionTarget = structuredAgentSessionTargetForHost(sessionOwner)
  const branchScope = useMemo(() => ({ hostId, workspaceId }), [hostId, workspaceId])
  // A branch made or opened here binds to this pane's subject, so its quick actions follow.
  const branchNavigation = useResearchPaneBranchNavigation((sessionId) => void bind(sessionId))
  const boundLabel = boundSession
    ? (boundSession.customLabel ??
      boundSession.aiVaultTitle?.title ??
      boundSession.label ??
      formatAgentTypeLabel(boundSession.agentSessionAgent))
    : boundSessionId
      ? 'Chat unavailable'
      : 'No chat connected'

  async function bind(sessionId: string | null): Promise<void> {
    try {
      await onBind(sessionId)
      setError(null)
    } catch (cause) {
      setError(`${title} chat was not linked. ${String(cause)}`)
    }
  }

  async function launch(agent: TuiAgent): Promise<void> {
    if (launching) {
      return
    }
    setLaunching(true)
    setError(null)
    try {
      setError(await onLaunch(agent))
    } catch (cause) {
      setError(`The ${title.toLowerCase()} could not start. ${String(cause)}`)
    } finally {
      setLaunching(false)
    }
  }

  async function link(experimentId: string | null): Promise<void> {
    if (!boundSession) {
      return
    }
    try {
      await linkResearchConversation({ tabId: boundSession.id, workspaceId, hostId }, experimentId)
      setError(null)
    } catch (cause) {
      setError(`Conversation was not linked. ${String(cause)}`)
    }
  }

  async function remove(): Promise<void> {
    if (!boundSession) {
      return
    }
    try {
      await deleteConversation(boundSession, hostId)
      setError(null)
    } catch (cause) {
      setError(`Conversation was not deleted. ${String(cause)}`)
    }
  }

  return (
    <div
      className={cn('min-h-0 min-w-0 flex-col', className)}
      style={{ display: visible ? 'flex' : 'none' }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex shrink-0 items-center gap-1">
          {boundSession ? (
            <span
              draggable
              title="Drag this conversation onto an Experiment"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'link'
                event.dataTransfer.setData(
                  RESEARCH_CONVERSATION_DRAG_TYPE,
                  JSON.stringify({ tabId: boundSession.id, workspaceId, hostId })
                )
              }}
            >
              <GripVertical className="size-3.5 cursor-grab text-muted-foreground" aria-hidden />
            </span>
          ) : null}
          <h2 className="text-xs font-semibold whitespace-nowrap">{title}</h2>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={boundLabel}>
            {boundLabel}
          </span>
          {boundSession ? (
            <ResearchChatBranchSwitcher
              scope={branchScope}
              sessionId={boundSession.entityId}
              onSwitch={(sessionId) => void bind(sessionId)}
            />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`${sessionLabel} options`}
                title="Chat options"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              <DropdownMenuLabel>Start a new {title.toLowerCase()} chat</DropdownMenuLabel>
              <ResearchAgentPickerMenuItems
                workspaceId={workspaceId}
                disabled={launching}
                onPick={(agent) => void launch(agent)}
              />
              {availableSessions.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Use an existing chat</DropdownMenuLabel>
                  {availableSessions.map((tab) => (
                    <DropdownMenuItem
                      key={tab.id}
                      disabled={launching}
                      onSelect={() => void bind(tab.entityId)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {tab.customLabel ??
                          tab.aiVaultTitle?.title ??
                          tab.label ??
                          formatAgentTypeLabel(tab.agentSessionAgent)}
                      </span>
                      {boundSession?.id === tab.id ? (
                        <Check className="size-3" aria-hidden />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              {boundSession ? (
                <>
                  <DropdownMenuSeparator />
                  <ResearchChatBranchMenuItem tab={boundSession} open={branchNavigation.open} />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Link2 aria-hidden /> Link to Experiment
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuLabel>Experiment</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => void link(null)}>
                        None{linkedExperiment ? '' : ' ✓'}
                      </DropdownMenuItem>
                      {experiments.length > 0 ? <DropdownMenuSeparator /> : null}
                      {experiments.map((experiment) => (
                        <DropdownMenuItem
                          key={experiment.id}
                          onSelect={() => void link(experiment.id)}
                        >
                          {experiment.name}
                          {linkedExperiment?.id === experiment.id ? ' ✓' : ''}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem className="text-destructive" onSelect={() => void remove()}>
                    <Trash2 aria-hidden /> Delete conversation…
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="border-b border-destructive/30 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}
      {toolbar}
      {boundSession && sessionTarget ? (
        <div className="min-h-0 flex-1">
          <NativeChatPlaceholderContext.Provider value={composerPlaceholder ?? null}>
            <NativeChatBranchNavigationContext.Provider value={branchNavigation}>
              <NativeChatView
                mode="structured"
                tabId={boundSession.id}
                // Why: a research window has no Workbench panes to split this chat into.
                groupId={researchWindowSurfaceTarget() ? undefined : boundSession.groupId}
                sessionId={boundSession.entityId}
                target={sessionTarget}
                agent={boundSession.agentSessionAgent}
                isVisible={visible}
                isFocusedGroup={visible}
                decorateOutgoingText={decorateOutgoingText}
              />
            </NativeChatBranchNavigationContext.Provider>
          </NativeChatPlaceholderContext.Provider>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
          {typeof emptyHint === 'string' ? (
            <p className="max-w-xs text-sm text-muted-foreground">{emptyHint}</p>
          ) : (
            emptyHint
          )}
          <ResearchAgentPicker
            workspaceId={workspaceId}
            disabled={launching}
            label={`Start a ${title.toLowerCase()} chat with`}
            onPick={(agent) => void launch(agent)}
          >
            <Plus aria-hidden /> Start a chat
          </ResearchAgentPicker>
          {launching && (
            <p role="status" className="text-xs text-muted-foreground">
              Starting agent chat…
            </p>
          )}
        </div>
      )}
    </div>
  )
}
