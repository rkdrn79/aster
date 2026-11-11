import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Tab } from '../../../../shared/tab-types'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import { Button } from '@/components/ui/button'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { ResearchAgentPicker } from './ResearchAgentPicker'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { useAppStore } from '@/store'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import type { ResearchWindowTarget } from '../../../../shared/research-page-window'
import { researchChatSessionTabs } from './ResearchAgentChatPane'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { useResearchWindowChatRequest } from './research-window-surface'

const EMPTY_TABS: readonly Tab[] = []
// How long a started chat may take to show up in this window's list before the spinner gives up.
const NEW_CHAT_APPEAR_TIMEOUT_MS = 20_000

function chatLabel(tab: ReturnType<typeof researchChatSessionTabs>[number]): string {
  return (
    tab.customLabel ??
    tab.aiVaultTitle?.title ??
    tab.label ??
    formatAgentTypeLabel(tab.agentSessionAgent)
  )
}

/**
 * A project window's Chats: the project's agent chats, one open beside the list. The main window
 * owns the tabs, so a new chat starts there, without moving the main window off its project.
 */
export function ResearchWindowChats({
  target
}: {
  target: ResearchWindowTarget
}): React.JSX.Element {
  const hostId = useAppStore((state) => selectResearchWorkspaceContext(state).hostId)
  const workspaceTabs = useAppStore(
    (state) => state.unifiedTabsByWorktree[target.workspaceId] ?? EMPTY_TABS
  )
  const chats = useMemo(
    () => (hostId ? researchChatSessionTabs(useAppStore.getState(), workspaceTabs, hostId) : []),
    [hostId, workspaceTabs]
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The chats before a start from here; the first one outside it is the chat that start made.
  const [launchBaseline, setLaunchBaseline] = useState<ReadonlySet<string> | null>(null)
  // A page in this window asked to show a chat (e.g. a proposal's "Open chat").
  const requestSeq = useResearchWindowChatRequest((state) => state.seq)
  useEffect(() => {
    const { tabId } = useResearchWindowChatRequest.getState()
    if (tabId) {
      setSelectedId(tabId)
      setLaunchBaseline(null)
      // Taken: a later visit to Chats keeps whatever the person picked since.
      useResearchWindowChatRequest.setState({ tabId: null })
    }
  }, [requestSeq])
  const created = launchBaseline ? (chats.find((tab) => !launchBaseline.has(tab.id)) ?? null) : null
  const starting = launchBaseline !== null && created === null
  // The main window answered, but the new chat has not shown up yet; don't wait on it forever.
  const [awaitingNewChat, setAwaitingNewChat] = useState(false)
  useEffect(() => {
    if (!awaitingNewChat || created) {
      return
    }
    const timer = setTimeout(() => {
      setLaunchBaseline(null)
      setAwaitingNewChat(false)
    }, NEW_CHAT_APPEAR_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [awaitingNewChat, created])

  const selected = created ?? chats.find((tab) => tab.id === selectedId) ?? chats[0] ?? null
  const owner = selected
    ? structuredAgentSessionOwnerForTab(useAppStore.getState(), selected)
    : null
  const sessionTarget = structuredAgentSessionTargetForHost(owner)

  const choose = (tabId: string): void => {
    setSelectedId(tabId)
    setLaunchBaseline(null)
  }
  const start = (agent: TuiAgent): void => {
    setLaunchBaseline(new Set(chats.map((tab) => tab.id)))
    setAwaitingNewChat(false)
    // The window's own resolution of its host, for a project opened before its host was stamped.
    void window.api.researchWindow
      .launchChat({ ...target, hostId: hostId ?? target.hostId }, agent)
      .then((result) => {
        if ('error' in result) {
          setLaunchBaseline(null)
          toast.error(result.error)
        } else {
          setAwaitingNewChat(true)
        }
      })
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label="Chats"
        className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/20"
      >
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <ResearchAgentPicker
            workspaceId={target.workspaceId}
            disabled={starting}
            label="Start a chat with"
            size="xs"
            variant="ghost"
            align="start"
            onPick={start}
          >
            <Plus aria-hidden /> New chat
          </ResearchAgentPicker>
        </div>
        <nav className="scrollbar-sleek min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {chats.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={tab.id === selected?.id ? 'secondary' : 'ghost'}
              aria-current={tab.id === selected?.id ? 'page' : undefined}
              className="w-full justify-start"
              title={chatLabel(tab)}
              onClick={() => choose(tab.id)}
            >
              <MessageSquare aria-hidden />
              <span className="min-w-0 truncate">{chatLabel(tab)}</span>
            </Button>
          ))}
          {starting ? (
            <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
              Starting chat…
            </p>
          ) : null}
        </nav>
        <p className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
          Terminals stay in the main window.
        </p>
      </aside>
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
              No chats in this project yet. Start one with New chat.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
