import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import type { NativeChatLiveSession } from '@/components/native-chat/native-chat-live-session-contract'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { researchChatTabLabel } from './research-chat-branch-actions'
import {
  collectChatMentions,
  processChatMentions,
  readChatLibraryRequests,
  settleChatLibraryRequests,
  type ChatPaperContext,
  type ScanCache
} from './research-chat-papers-actions'
import { useChatPaperMode } from './research-chat-papers-mode'
import {
  ensureChatRecord,
  followChatPapersFromOtherWindows,
  pendingChatPapers,
  useChatPapers
} from './research-chat-papers-store'
import { useResearchLibrary } from './research-library-store'
import { selectLibraryScopeKeyParts } from './research-workspace-context'

const REQUEST_POLL_MS = 30_000

/** Tool rows that ran the harness `library add`; each new one means a request may be waiting. */
function libraryAddRows(messages: readonly NativeChatMessage[]): number {
  let rows = 0
  for (const message of messages.slice(-40)) {
    for (const block of message.blocks) {
      const text =
        block.type === 'tool-result'
          ? block.output.slice(0, 4000)
          : block.type === 'tool-call'
            ? JSON.stringify(block.input ?? '').slice(0, 4000)
            : ''
      if (/\blibrary add\b|Asked Aster to add/.test(text)) {
        rows += 1
      }
    }
  }
  return rows
}

function chatTitleSelector(workspaceId: string | null | undefined, sessionId: string) {
  return (state: AppState): string | null => {
    const tab = workspaceId
      ? (state.unifiedTabsByWorktree[workspaceId] ?? []).find(
          (entry) => entry.entityId === sessionId
        )
      : undefined
    return tab ? researchChatTabLabel(tab) : null
  }
}

/**
 * Watches one visible chat for papers its project's Library lacks, and for its agent's
 * `library add` requests, and applies the person's setting to each.
 */
export function useResearchChatPapers({
  workspaceId,
  sessionId,
  session,
  isVisible
}: {
  workspaceId: string | null | undefined
  sessionId: string
  session: Pick<NativeChatLiveSession, 'messages' | 'status' | 'readPhase'>
  isVisible: boolean
}) {
  const hostId = useAppStore((state) => selectLibraryScopeKeyParts(state, workspaceId)?.hostId)
  const workspacePath = useAppStore(
    (state) => selectLibraryScopeKeyParts(state, workspaceId)?.workspacePath
  )
  const titleOf = useMemo(() => chatTitleSelector(workspaceId, sessionId), [workspaceId, sessionId])
  const chatTitle = useAppStore(titleOf)
  const mode = useChatPaperMode()
  const libraryReady = useResearchLibrary((state) => state.document !== null)
  const chat = useChatPapers((state) => state.chats[sessionId])
  const notice = useChatPapers((state) => state.notices[sessionId])
  const cache = useRef<ScanCache>(new Map())
  const context = useMemo<ChatPaperContext | null>(
    () =>
      hostId && workspaceId && workspacePath
        ? { scope: { hostId, workspaceId, workspacePath }, chatKey: sessionId, chatTitle }
        : null,
    [hostId, workspaceId, workspacePath, sessionId, chatTitle]
  )
  // Why: the Library belongs to the Research layout; the Code layout has no place to show it.
  const researchUi = useAppStore((state) => state.settings?.researchUiEnabled === true)
  const libraryApi = typeof window !== 'undefined' && Boolean(window.api?.researchLibrary?.read)
  const enabled = researchUi && libraryApi
  const active =
    enabled && context !== null && isVisible && session.readPhase === 'ready' && libraryReady
  const isWorking = session.status === 'working'

  useEffect(() => {
    if (enabled) {
      followChatPapersFromOtherWindows()
      void useResearchLibrary.getState().load()
    }
  }, [enabled])

  useEffect(() => {
    if (!active || !context || mode === 'off') {
      return
    }
    const record = ensureChatRecord(sessionId)
    const found = collectChatMentions(session.messages, record.since, isWorking, cache.current)
    if (found.length) {
      void processChatMentions(context, found, mode)
    }
  }, [active, context, mode, session.messages, isWorking, sessionId])

  const libraryAdds = useMemo(() => libraryAddRows(session.messages), [session.messages])
  useEffect(() => {
    if (!active || !context) {
      return
    }
    let stopped = false
    const read = (): void => {
      void readChatLibraryRequests(context.scope, sessionId)
        .then(async (found) => {
          if (stopped || !found.length) {
            return
          }
          ensureChatRecord(sessionId)
          // Why: Off mutes passive detection only; an agent's explicit request still asks.
          await processChatMentions(context, found, mode === 'auto' ? 'auto' : 'ask')
          settleChatLibraryRequests(sessionId, found)
        })
        .catch(() => undefined)
    }
    const soon = window.setTimeout(read, libraryAdds ? 800 : 0)
    const poll = window.setInterval(read, REQUEST_POLL_MS)
    return () => {
      stopped = true
      window.clearTimeout(soon)
      window.clearInterval(poll)
    }
  }, [active, context, mode, sessionId, libraryAdds])

  return { context: enabled ? context : null, mode, pending: pendingChatPapers(chat), notice }
}
