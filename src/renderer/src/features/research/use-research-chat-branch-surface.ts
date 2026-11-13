// What a structured chat offers for branching: where its rows may branch, why not when they can't,
// and the branches themselves, opened where this chat is shown.

import { useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { isAgentSessionRewindTarget } from '../../../../shared/agent-session-rewind'
import { readAgentJournalTurn } from '../../../../shared/agent-session-turn-record'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { AgentType } from '../../../../shared/agent-status-types'
import { agentSessionBranchReach } from '../../../../shared/agent-session-branch'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { Tab } from '../../../../shared/tab-types'
import { useAppStore } from '@/store'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { supportsStructuredAgentSessionBranch } from '@/runtime/structured-agent-session-branch-client'
import {
  NativeChatBranchNavigationContext,
  type NativeChatBranchSurface
} from '@/components/native-chat/native-chat-branch-context'
import {
  RESEARCH_CHAT_BRANCH_HOST_UPDATE,
  researchChatBranchAgentBlock,
  researchChatBranchEarlierBlock,
  researchChatBranchReasonCopy
} from './research-chat-branch-copy'
import {
  openResearchChatHere,
  useResearchChatBranchPending,
  type ResearchChatBranchRequest
} from './research-chat-branch-run'
import { researchChatTabLabel, runResearchChatBranch } from './research-chat-branch-actions'

const EMPTY_TABS: readonly Tab[] = []

/** Each message's next turn-opening message, the cut a branch "through" that message makes. */
function nextOpeners(
  messages: readonly NativeChatMessage[],
  openers: ReadonlySet<string>
): Map<string, string | null> {
  const next = new Map<string, string | null>()
  let upcoming: string | null = null
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const id = messages[index]!.id
    next.set(id, upcoming)
    if (openers.has(id)) {
      upcoming = id
    }
  }
  return next
}

function textOnly(item: AgentJournalRenderItem | undefined): string | null {
  if (item?.body.kind !== 'message' || item.body.blocks.some((block) => block.type !== 'text')) {
    return null
  }
  return item.body.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('\n')
}

/** For a structured chat view: its pane's props, its workspace, its controller and its messages. */
export function useResearchChatBranchSurface(
  pane: { tabId: string; sessionId: string; agent: AgentType; target: RuntimeClientTarget },
  workspaceId: string | null,
  controller: {
    status: string
    isWorking: boolean
    journalItems: readonly AgentJournalRenderItem[]
  },
  messages: readonly NativeChatMessage[]
): NativeChatBranchSurface {
  const { tabId, sessionId, agent, target } = pane
  const { isWorking, journalItems } = controller
  const navigation = useContext(NativeChatBranchNavigationContext)
  const hostId = executionHostIdForStructuredTarget(target)
  const scope = useMemo(() => (workspaceId ? { hostId, workspaceId } : null), [hostId, workspaceId])
  const source = useMemo(() => (scope ? { ...scope, sessionId } : null), [scope, sessionId])
  const pending = useResearchChatBranchPending(source)
  const tab = useAppStore((state) =>
    (workspaceId ? (state.unifiedTabsByWorktree[workspaceId] ?? EMPTY_TABS) : EMPTY_TABS).find(
      (candidate) => candidate.id === tabId
    )
  )
  const [hostSupports, setHostSupports] = useState<boolean | null>(null)
  useEffect(() => {
    let current = true
    void supportsStructuredAgentSessionBranch(target).then((supported) => {
      if (current) {
        setHostSupports(supported)
      }
    })
    return () => {
      current = false
    }
  }, [target])

  const openers = useMemo(() => {
    const opener = new Map<string, string>()
    for (const item of journalItems) {
      const turn = readAgentJournalTurn(item.body)
      if (turn?.userItemId) {
        opener.set(item.itemId, turn.userItemId)
      }
    }
    return new Set(
      journalItems
        .filter((item) => isAgentSessionRewindTarget(item, (turn) => opener.get(turn)))
        .map((item) => item.itemId)
    )
  }, [journalItems])
  const next = useMemo(() => nextOpeners(messages, openers), [messages, openers])
  const latestOnly = agentSessionBranchReach(agent) === 'latest-only'
  const disabledReason =
    researchChatBranchAgentBlock(agent) ??
    (hostSupports === false ? RESEARCH_CHAT_BRANCH_HOST_UPDATE : null) ??
    (!scope || controller.status !== 'ready' ? 'Wait for the chat to finish connecting.' : null) ??
    (pending ? 'Making the branch…' : null) ??
    (latestOnly && isWorking ? researchChatBranchReasonCopy('busy', agent) : null)

  return useMemo<NativeChatBranchSurface>(() => {
    const open = (id: string): void => {
      if (navigation) {
        navigation.open(id)
      } else if (scope) {
        openResearchChatHere(scope, id)
      }
    }
    const run = (request: ResearchChatBranchRequest): void => {
      if (!scope || disabledReason) {
        if (disabledReason) {
          toast.error(disabledReason)
        }
        return
      }
      const label = tab ? researchChatTabLabel(tab) : 'Chat'
      void runResearchChatBranch({ ...scope, sessionId, agent, label, target }, request, open)
    }
    const item = (id: string) => journalItems.find((candidate) => candidate.itemId === id)
    const edit = (id: string): ResearchChatBranchRequest => {
      const body = item(id)?.body
      return {
        at: 'message',
        beforeItemId: id,
        ...(body?.kind === 'message' ? { edit: { itemId: id, blocks: body.blocks } } : {})
      }
    }
    return {
      disabledReason,
      earlierDisabledReason: researchChatBranchEarlierBlock(agent),
      openerIds: openers,
      isLatest: (id) => !openers.has(id) && (next.get(id) ?? null) === null,
      branchFrom: (id) => {
        if (!openers.has(id)) {
          run({ at: 'through', beforeItemId: next.get(id) ?? null })
          return
        }
        // The person's message is asked again; one with images waits in the composer instead.
        const resend = textOnly(item(id))
        if (resend === null) {
          toast.message('This message has images, so it waits in the new chat to send.')
        }
        run(resend === null ? edit(id) : { at: 'message', beforeItemId: id, resend })
      },
      editAndBranch: (id) => run(edit(id)),
      branchChat: () => run({ at: 'through', beforeItemId: null })
    }
  }, [
    agent,
    disabledReason,
    journalItems,
    navigation,
    next,
    openers,
    scope,
    sessionId,
    tab,
    target
  ])
}
