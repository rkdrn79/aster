import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { conversationExperiment } from '../../../../shared/research/research-conversation-context'
import { ResearchAgentPicker } from './ResearchAgentPicker'
import { ResearchConversationRow } from './ResearchConversationRow'
import { openResearchView } from './research-navigation'
import { linkResearchConversation } from './research-conversation-link'
import { useResearchRecords } from './research-records-store'
import { researchWindowSurfaceTarget } from './research-window-surface'
import {
  chooseResearchWindowChat,
  startResearchWindowChat,
  useResearchWindowChats
} from './research-window-chat-list'

/**
 * A side's Workbench section: its project's chats, as the main window's sidebar lists them. A
 * side has no terminals, so its Workbench is the chat picked here, and a new one starts through
 * the main window, which owns the tabs.
 */
export function ResearchSideWorkbenchChats(): React.JSX.Element | null {
  const target = researchWindowSurfaceTarget()
  return target ? <SideChats target={target} /> : null
}

function SideChats({
  target
}: {
  target: NonNullable<ReturnType<typeof researchWindowSurfaceTarget>>
}): React.JSX.Element {
  const { hostId, chats, selected, starting } = useResearchWindowChats(target)
  const onWorkbench = useAppStore((state) => state.activeView === 'terminal')
  const document = useResearchRecords((state) => state.document)
  useEffect(() => {
    void useResearchRecords.getState().load()
  }, [])
  const experiments =
    document?.experiments.filter(
      (experiment) =>
        experiment.workspaceId === target.workspaceId &&
        experiment.hostId === hostId &&
        !experiment.archived
    ) ?? []
  const show = (tabId: string): void => {
    chooseResearchWindowChat(tabId)
    openResearchView('terminal')
  }

  return (
    <section className="space-y-2 py-1" aria-label="Conversations">
      <ResearchAgentPicker
        workspaceId={target.workspaceId}
        disabled={starting}
        label="Start a chat with"
        size="sm"
        variant="outline"
        align="start"
        className="w-full justify-start"
        onPick={(agent) => {
          startResearchWindowChat(target, hostId, chats, agent)
          openResearchView('terminal')
        }}
      >
        <Plus className="size-4" aria-hidden />
        New conversation
      </ResearchAgentPicker>
      {starting ? (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          Starting chat…
        </p>
      ) : null}
      <div className="space-y-1">
        {chats.map((tab) => (
          <ResearchConversationRow
            key={tab.id}
            tab={tab}
            hostId={hostId}
            active={onWorkbench && selected?.id === tab.id}
            linkedExperiment={
              document
                ? conversationExperiment(document, tab.id, target.workspaceId, hostId, tab.entityId)
                : null
            }
            experiments={experiments}
            onSelect={() => show(tab.id)}
            onLink={
              hostId
                ? (experimentId) =>
                    void linkResearchConversation(
                      { tabId: tab.id, workspaceId: target.workspaceId, hostId },
                      experimentId
                    )
                : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}
