import { useMemo, useRef, useState } from 'react'
import { ResearchChip } from './research-chip'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { useResearchRecords } from './research-records-store'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import type { RebuttalAgentScope } from './research-rebuttal-agent-session'
import { rebuttalAgentSessionId } from './research-rebuttal-agent-session'
import {
  buildReviewerOpenPrompt,
  reviewerRepliesContext
} from './research-rebuttal-reviewer-prompts'
import {
  bindReviewerAgentSession,
  launchReviewerAgent,
  rebuttalReviewerSessionIds,
  reviewerAgentSessionId
} from './research-rebuttal-reviewer-session'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { ResearchRebuttalTurnChips } from './ResearchRebuttalTurnChips'
import type { RebuttalActions, ReviewerAgentRequest } from './use-research-rebuttal-actions'

type Props = {
  scope: RebuttalAgentScope
  snapshot: RebuttalSnapshot
  reviewerId: string
  visible: boolean
  actions: RebuttalActions
}

const QUICK_ASKS: readonly { request: ReviewerAgentRequest; label: string }[] = [
  { request: 'convinced', label: 'What still stands?' },
  { request: 'weakest', label: 'Push back on my weakest reply' }
]

/** This reviewer's simulated agent: a debate partner, labelled as a simulation everywhere. */
export function ResearchRebuttalDebatePane({
  scope,
  snapshot,
  reviewerId,
  visible,
  actions
}: Props): React.JSX.Element {
  const slug = snapshot.bundle.meta.slug
  const boundSessionId = useResearchRecords((state) =>
    reviewerAgentSessionId(state.document, scope, slug, reviewerId)
  )
  const document = useResearchRecords((state) => state.document)
  const excludeSessionIds = useMemo(() => {
    const others = new Set([
      ...rebuttalReviewerSessionIds(document, scope),
      rebuttalAgentSessionId(document, scope) ?? ''
    ])
    others.delete(boundSessionId ?? '')
    return others
  }, [document, scope, boundSessionId])
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(snapshot)
  latest.current = snapshot
  const sentContext = useRef<Map<string, string>>(new Map())

  // Why: the simulated reviewer judges what the replies say now, not when the chat started.
  function decorate(sessionId: string, text: string): string {
    const context = reviewerRepliesContext(latest.current, reviewerId)
    if (!context || sentContext.current.get(sessionId) === context) {
      return text
    }
    sentContext.current.set(sessionId, context)
    return withAsterContext(text, { label: 'Current replies to you', body: context })
  }

  async function ask(request: ReviewerAgentRequest): Promise<void> {
    setError(await actions.askReviewer(reviewerId, request))
  }

  return (
    <ResearchAgentChatPane
      workspaceId={scope.workspaceId}
      hostId={scope.hostId}
      boundSessionId={boundSessionId}
      home={{ kind: 'rebuttal' }}
      title={`Simulated ${reviewerId}`}
      sessionLabel={`Simulated ${reviewerId} chat`}
      emptyHint={`Debate your replies with an agent playing ${reviewerId}: their review, score and tone. It pushes back when a reply is weak and concedes when it is answered. It is a simulation, never the real reviewer.`}
      composerPlaceholder={`Argue your point to the simulated ${reviewerId}…`}
      visible={visible}
      className="flex-1"
      onBind={(sessionId) => bindReviewerAgentSession(scope, slug, reviewerId, sessionId)}
      onLaunch={(agent) =>
        launchReviewerAgent(
          scope,
          slug,
          reviewerId,
          agent,
          buildReviewerOpenPrompt(snapshot, reviewerId)
        )
      }
      decorateMessage={decorate}
      excludeSessionIds={excludeSessionIds}
      toolbar={
        boundSessionId ? (
          <div className="mx-3 mt-1 mb-2 shrink-0 space-y-2 rounded-lg bg-muted/60 px-3 py-2 dark:bg-muted/45">
            <p className="text-2xs leading-4 text-muted-foreground">
              Simulation of {reviewerId} from their review and score. Not the real reviewer. It
              critiques; only you or the Rebuttal agent write replies.
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {QUICK_ASKS.map(({ request, label }) => (
                <ResearchChip key={request} onClick={() => void ask(request)}>
                  {label}
                </ResearchChip>
              ))}
              <ResearchRebuttalTurnChips actor={`reviewer:${reviewerId}`} />
            </div>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mx-3 mt-1 mb-2 shrink-0 rounded-lg bg-muted/60 px-3 py-2 text-2xs text-muted-foreground dark:bg-muted/45">
            Simulation of {reviewerId}. Not the real reviewer.
          </p>
        )
      }
    />
  )
}
