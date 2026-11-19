import { useMemo } from 'react'
import { create } from 'zustand'
import { CornerDownLeft, X } from 'lucide-react'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { Tab } from '../../../../shared/tab-types'
import { AgentWorkingMark } from '@/components/ai/thinking-indicator'
import { ShimmerText } from '@/components/ai/shimmer-text'
import { AnimatedCheck } from '@/components/ui/animated-check'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { useResearchRecords } from './research-records-store'
import {
  researchChatBranchChildren,
  withResearchChatBranchChange,
  type ResearchChatBranch,
  type ResearchChatScope
} from './research-chat-branches'
import { useResearchChatLiveStatus } from './ResearchChatStatusBadge'

const EMPTY_TABS: readonly Tab[] = []

/**
 * A chat's subtasks, above its composer: a quiet chip while one runs, then a result card that says
 * whether the result has reached the agent yet. Either opens the subtask's own chat to inspect it;
 * subtasks stay out of every chat list.
 */
export function ResearchSubtaskStrip({
  sessionId,
  target,
  workspaceId
}: {
  sessionId: string
  target: RuntimeClientTarget
  workspaceId: string | null | undefined
}): React.JSX.Element | null {
  const hostId = executionHostIdForStructuredTarget(target)
  const scope = useMemo(() => (workspaceId ? { hostId, workspaceId } : null), [hostId, workspaceId])
  const document = useResearchRecords((state) => state.document)
  const inspect = (id: string): void => {
    if (scope) {
      useResearchSubtaskInspection.setState({ open: { scope, sessionId: id, target } })
    }
  }
  const subtasks = scope
    ? researchChatBranchChildren(document, scope, sessionId, 'subtasks').filter(
        ({ branch }) => !branch.dismissedAt
      )
    : []
  if (!scope || subtasks.length === 0) {
    return null
  }
  return (
    <div
      data-research-subtasks=""
      className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-2"
    >
      {subtasks.map(({ sessionId: id, branch }) =>
        branch.finishedAt ? (
          <SubtaskResultCard
            key={id}
            branch={branch}
            onOpen={() => inspect(id)}
            onDismiss={() =>
              void useResearchRecords.getState().update((current) =>
                withResearchChatBranchChange(current, scope, id, {
                  dismissedAt: new Date().toISOString()
                })
              )
            }
          />
        ) : (
          <SubtaskChip
            key={id}
            scope={scope}
            sessionId={id}
            branch={branch}
            onOpen={() => inspect(id)}
          />
        )
      )}
    </div>
  )
}

function SubtaskChip({
  scope,
  sessionId,
  branch,
  onOpen
}: {
  scope: ResearchChatScope
  sessionId: string
  branch: ResearchChatBranch
  onOpen: () => void
}): React.JSX.Element {
  const status = useResearchChatLiveStatus(sessionId, scope.hostId)
  const state = status === 'needs-you' ? 'needs you' : 'running'
  return (
    <button
      type="button"
      data-research-subtask-chip={state}
      title="Open the subtask's chat"
      onClick={onOpen}
      className="press-scale flex w-fit max-w-full items-center gap-2 rounded-lg bg-muted px-3 py-1 text-xs text-muted-foreground animate-pop-in [--pop-from-y:4px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:animate-none"
    >
      {state === 'running' ? <AgentWorkingMark className="size-3" /> : null}
      {state === 'needs you' ? (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground" />
      ) : null}
      {/* The words sweep while the copy works; a still label once it waits on the person. */}
      <ShimmerText active={state === 'running'} className="min-w-0 truncate">
        Subtask: {branch.task} · {state}
      </ShimmerText>
    </button>
  )
}

function SubtaskResultCard({
  branch,
  onOpen,
  onDismiss
}: {
  branch: ResearchChatBranch
  onOpen: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const delivered = Boolean(branch.deliveredAt)
  return (
    <section
      aria-label="Subtask result"
      data-research-subtask-result={delivered ? 'delivered' : 'waiting'}
      className={cn(
        'rounded-lg px-3 text-xs',
        // A result waiting for the agent is a raised card that rises in; once handed over, one
        // quiet line on the track is left.
        delivered
          ? 'bg-muted/60 py-1 text-muted-foreground'
          : 'bg-card py-3 shadow-raised animate-pop-in [--pop-from-y:4px] motion-reduce:animate-none'
      )}
    >
      <div className="flex items-center gap-2">
        {delivered ? (
          <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <span className="flex shrink-0 text-muted-foreground">
            <AnimatedCheck className="size-4" />
          </span>
        )}
        <span className={cn('min-w-0 flex-1 truncate', !delivered && 'font-medium')}>
          Subtask result · {branch.task}
        </span>
        {/* Once the agent has it, the chat itself shows the result: one quiet line is left. */}
        {delivered ? <span className="shrink-0">Handed to the agent</span> : null}
        <Button size="xs" variant="ghost" onClick={onOpen}>
          Open
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Dismiss subtask result"
          onClick={onDismiss}
        >
          <X aria-hidden />
        </Button>
      </div>
      {delivered ? null : (
        <>
          {branch.resultPreview ? (
            <p className="mt-1 line-clamp-3 text-muted-foreground">{branch.resultPreview}</p>
          ) : null}
          <p className="mt-1 text-2xs text-muted-foreground">
            Goes to the agent here once it finishes its current turn
          </p>
        </>
      )}
    </section>
  )
}

/** The subtask a chat asked to look at. Kept outside the chat that asked, so typing in the
 *  subtask's composer never reaches that chat's own key handling. */
export const useResearchSubtaskInspection = create<{
  open: { scope: ResearchChatScope; sessionId: string; target: RuntimeClientTarget } | null
}>(() => ({ open: null }))

/** The subtask's own chat, opened for a look; it keeps running whether this is open or not.
 *  Mounted once per window, outside every chat. */
export function ResearchSubtaskInspectDialog(): React.JSX.Element {
  const open = useResearchSubtaskInspection((state) => state.open)
  const tab = useAppStore((state) =>
    open
      ? (state.unifiedTabsByWorktree[open.scope.workspaceId] ?? EMPTY_TABS).find(
          (candidate) => candidate.entityId === open.sessionId
        )
      : undefined
  )
  return (
    <Dialog
      open={open !== null}
      onOpenChange={(next) => {
        if (!next) {
          useResearchSubtaskInspection.setState({ open: null })
        }
      }}
    >
      <DialogContent className="flex h-[72vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tab?.customLabel ?? 'Subtask'}</DialogTitle>
          <DialogDescription>
            A hidden copy of the chat working on one task. Its result goes back to the chat.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {open && tab?.agentSessionAgent ? (
            <NativeChatView
              mode="structured"
              tabId={tab.id}
              sessionId={open.sessionId}
              target={open.target}
              agent={tab.agentSessionAgent}
              isVisible
              isFocusedGroup
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This subtask&rsquo;s chat is not open here
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
