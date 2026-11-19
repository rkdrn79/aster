// Watches every subtask that has not reported back yet: when its copy finishes, the result is
// noted for the card in its chat, and once that chat's agent is idle the result goes to it as a
// message, which Aster holds until then as a queued message would be. Mounted in the main window
// only, so one window delivers each result once.

import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import { useStructuredAgentSessionStatusSummary } from '@/components/native-chat/StructuredAgentSessionStatusBridge'
import { structuredAgentSessionTargetForHost } from '@/runtime/structured-agent-session-owner'
import { useResearchRecords } from './research-records-store'
import {
  researchChatCopyKind,
  withResearchChatBranchChange,
  type ResearchChatBranch
} from './research-chat-branches'
import {
  readResearchSubtaskResult,
  researchSubtaskDeliveryMessage,
  researchSubtaskPreview,
  RESEARCH_SUBTASK_PROMPT_PREFIX
} from './research-subtask-result'

type PendingSubtask = {
  key: string
  hostId: string
  workspaceId: string
  sessionId: string
  branch: ResearchChatBranch
}

/** The subtasks whose result has not reached their chat. */
export function pendingResearchSubtasks(
  chatBranches: Record<string, ResearchChatBranch> | undefined
): PendingSubtask[] {
  return Object.entries(chatBranches ?? {}).flatMap(([key, branch]) => {
    if (researchChatCopyKind(branch) !== 'subtask' || branch.deliveredAt) {
      return []
    }
    const parsed: unknown = JSON.parse(key)
    const [hostId, workspaceId, sessionId]: unknown[] = Array.isArray(parsed) ? parsed : []
    if (
      typeof hostId !== 'string' ||
      typeof workspaceId !== 'string' ||
      typeof sessionId !== 'string'
    ) {
      return []
    }
    return [{ key, hostId, workspaceId, sessionId, branch }]
  })
}

export function ResearchSubtaskDelivery(): React.JSX.Element {
  const chatBranches = useResearchRecords((state) => state.document?.chatBranches)
  useEffect(() => {
    void useResearchRecords.getState().load()
  }, [])
  const pending = useMemo(() => pendingResearchSubtasks(chatBranches), [chatBranches])
  return (
    <>
      {pending.map((subtask) => (
        <ResearchSubtaskWatch key={subtask.key} subtask={subtask} />
      ))}
    </>
  )
}

function ResearchSubtaskWatch({ subtask }: { subtask: PendingSubtask }): null {
  const { hostId, workspaceId, sessionId, branch } = subtask
  const target = useMemo(
    () =>
      structuredAgentSessionTargetForHost(normalizeExecutionHostId(hostId)) ?? {
        kind: 'local' as const
      },
    [hostId]
  )
  const own = useStructuredAgentSessionStatusSummary(sessionId, target).summary
  const parent = useStructuredAgentSessionStatusSummary(branch.parentSessionId, target).summary
  const busy = useRef(false)
  const [tick, setTick] = useState(0)
  const scope = useMemo(() => ({ hostId, workspaceId }), [hostId, workspaceId])
  const ownIdle =
    own?.status === 'idle' &&
    own.turnOutcome !== undefined &&
    own.latestPrompt.startsWith(RESEARCH_SUBTASK_PROMPT_PREFIX)
  // Never into a running turn, nor while the chat's state is unknown: the result waits.
  const parentIdle = parent !== null && parent.status !== 'working' && parent.status !== 'attention'
  // While there is something to do, look again every little while: a step that waited on a busy
  // chat, a failed read, or a send the chat was not ready for is tried once more.
  const hasWork = (!branch.finishedAt && ownIdle) || (Boolean(branch.finishedAt) && parentIdle)
  useEffect(() => {
    if (!hasWork) {
      return
    }
    const heartbeat = setInterval(() => setTick((value) => value + 1), 2_000)
    return () => clearInterval(heartbeat)
  }, [hasWork])

  useEffect(() => {
    const finishes = !branch.finishedAt && ownIdle
    const delivers = Boolean(branch.finishedAt) && parentIdle
    if (busy.current || (!finishes && !delivers)) {
      return
    }
    busy.current = true
    void (async () => {
      try {
        const result = await readResearchSubtaskResult(target, sessionId)
        if (!result) {
          return
        }
        if (finishes) {
          await useResearchRecords.getState().update((document) =>
            withResearchChatBranchChange(document, scope, sessionId, {
              finishedAt: new Date().toISOString(),
              resultPreview: researchSubtaskPreview(result)
            })
          )
          return
        }
        const sent = await sendMessageToAgent({
          worktreeId: workspaceId,
          target: { kind: 'structured-session', sessionId: branch.parentSessionId },
          prompt: researchSubtaskDeliveryMessage(branch.task ?? '', result)
        })
        // An unconfirmed send may have arrived: it is never sent twice.
        if (sent.status === 'sent' || sent.status === 'unconfirmed') {
          await useResearchRecords.getState().update((document) =>
            withResearchChatBranchChange(document, scope, sessionId, {
              deliveredAt: new Date().toISOString()
            })
          )
        }
      } catch (cause) {
        console.warn('[research-subtask] result not handed back yet', cause)
      } finally {
        busy.current = false
      }
    })()
  }, [
    branch.finishedAt,
    branch.parentSessionId,
    branch.task,
    ownIdle,
    parentIdle,
    scope,
    sessionId,
    target,
    tick,
    workspaceId
  ])
  return null
}
