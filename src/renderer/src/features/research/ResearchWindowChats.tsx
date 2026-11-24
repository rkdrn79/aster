import { useEffect } from 'react'
import { MessageSquare, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ResearchAgentPicker } from './ResearchAgentPicker'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { useAppStore } from '@/store'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import type { ResearchWindowTarget } from '../../../../shared/research-page-window'
import { researchWindowSideId, useResearchWindowChatRequest } from './research-window-surface'
import { ResearchChatBranchMenuItem } from './ResearchChatBranchMenuItem'
import { ResearchChatForkStatus } from './ResearchChatStatusBadge'
import {
  chooseResearchWindowChat,
  researchWindowChatLabel,
  startResearchWindowChat,
  useResearchWindowChatSelection,
  useResearchWindowChats
} from './research-window-chat-list'

// How long a started chat may take to show up in this window's list before the spinner gives up.
const NEW_CHAT_APPEAR_TIMEOUT_MS = 20_000

/**
 * A project window's Chats: the project's agent chats, one open beside the list. The main window
 * owns the tabs, so a new chat starts there, without moving the main window off its project. In a
 * side the list is the sidebar's Workbench section, as in the main window, so only the chat shows.
 */
export function ResearchWindowChats({
  target
}: {
  target: ResearchWindowTarget
}): React.JSX.Element {
  const { hostId, chats, selected, created, starting } = useResearchWindowChats(target)
  const awaitingNewChat = useResearchWindowChatSelection((state) => state.awaitingNewChat)
  const showList = researchWindowSideId() === null
  // A page in this window asked to show a chat (e.g. a proposal's "Open chat").
  const requestSeq = useResearchWindowChatRequest((state) => state.seq)
  useEffect(() => {
    const { tabId } = useResearchWindowChatRequest.getState()
    if (tabId) {
      chooseResearchWindowChat(tabId)
      // Taken: a later visit to Chats keeps whatever the person picked since.
      useResearchWindowChatRequest.setState({ tabId: null })
    }
  }, [requestSeq])
  // The main window answered, but the new chat has not shown up yet; don't wait on it forever.
  useEffect(() => {
    if (!awaitingNewChat || created) {
      return
    }
    const timer = setTimeout(() => {
      useResearchWindowChatSelection.setState({ launchBaseline: null, awaitingNewChat: false })
    }, NEW_CHAT_APPEAR_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [awaitingNewChat, created])

  const owner = selected
    ? structuredAgentSessionOwnerForTab(useAppStore.getState(), selected)
    : null
  const sessionTarget = structuredAgentSessionTargetForHost(owner)

  return (
    <div className="flex min-h-0 flex-1">
      {showList ? (
        <aside
          aria-label="Chats"
          // Why narrower below md: a project window can be under 768px wide.
          className="flex w-44 shrink-0 flex-col border-r border-border bg-muted/20 md:w-60"
        >
          <div className="flex items-center gap-1 border-b border-border px-2 py-2">
            <ResearchAgentPicker
              workspaceId={target.workspaceId}
              disabled={starting}
              label="Start a chat with"
              size="xs"
              variant="ghost"
              align="start"
              onPick={(agent) => startResearchWindowChat(target, hostId, chats, agent)}
            >
              <Plus aria-hidden /> New chat
            </ResearchAgentPicker>
          </div>
          <nav className="scrollbar-sleek min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {chats.map((tab) => (
              <div key={tab.id} className="group flex min-w-0 items-center gap-0.5">
                <Button
                  size="sm"
                  variant={tab.id === selected?.id ? 'secondary' : 'ghost'}
                  aria-current={tab.id === selected?.id ? 'page' : undefined}
                  className="min-w-0 flex-1 justify-start"
                  title={researchWindowChatLabel(tab)}
                  onClick={() => chooseResearchWindowChat(tab.id)}
                >
                  <MessageSquare aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {researchWindowChatLabel(tab)}
                  </span>
                  <ResearchChatForkStatus tab={tab} hostId={hostId} />
                </Button>
                {/* Why: shown on hover, focus or while open so each row reads as a title first. */}
                <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Chat options for ${researchWindowChatLabel(tab)}`}
                        title="Chat options"
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <ResearchChatBranchMenuItem tab={tab} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            ))}
            {starting ? (
              <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
                Starting chat…
              </p>
            ) : null}
          </nav>
          <p className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
            Terminals stay in the main window
          </p>
        </aside>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected && sessionTarget ? (
          // Why no groupId: splitting a chat into the Workbench's panes only makes sense there.
          <NativeChatView
            key={selected.id}
            mode="structured"
            tabId={selected.id}
            sessionId={selected.entityId}
            target={sessionTarget}
            agent={selected.agentSessionAgent}
            isVisible
            isFocusedGroup
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">
              {starting
                ? 'Starting chat…'
                : showList
                  ? 'No chats in this project yet. Start one with New chat.'
                  : 'No chats in this project yet. Start one with New conversation.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
