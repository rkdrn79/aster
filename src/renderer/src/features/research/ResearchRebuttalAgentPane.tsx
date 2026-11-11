import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useResearchRecords } from './research-records-store'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import {
  REBUTTAL_QUICK_ACTIONS,
  type RebuttalAgentRequest
} from './research-rebuttal-agent-prompts'
import {
  bindRebuttalAgentSession,
  launchRebuttalAgent,
  rebuttalAgentSessionId,
  type RebuttalAgentScope
} from './research-rebuttal-agent-session'
import { rebuttalReviewerSessionIds } from './research-rebuttal-reviewer-session'
import { ResearchRebuttalTurnChips } from './ResearchRebuttalTurnChips'

type Props = {
  scope: RebuttalAgentScope
  visible: boolean
  /** Null while no rebuttal is open, which hides the quick actions. */
  onRequest: ((request: RebuttalAgentRequest) => Promise<string | null>) | null
}

/** The author-side Rebuttal chat: it drafts and revises; the person decides what stays. */
export function ResearchRebuttalAgentPane({ scope, visible, onRequest }: Props): React.JSX.Element {
  const boundSessionId = useResearchRecords((state) =>
    rebuttalAgentSessionId(state.document, scope)
  )
  const document = useResearchRecords((state) => state.document)
  const excludeSessionIds = useMemo(
    () => new Set(rebuttalReviewerSessionIds(document, scope)),
    [document, scope]
  )
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(request: RebuttalAgentRequest, label: string): Promise<void> {
    if (!onRequest) {
      return
    }
    setSending(label)
    setError(await onRequest(request))
    setSending(null)
  }

  return (
    <ResearchAgentChatPane
      workspaceId={scope.workspaceId}
      hostId={scope.hostId}
      boundSessionId={boundSessionId}
      home={{ kind: 'rebuttal' }}
      title="Rebuttal agent"
      sessionLabel="Rebuttal agent chat"
      emptyHint="Start the Rebuttal chat. It splits reviews into concerns, groups the shared ones, and drafts and revises replies. Its edits show under each reply with Undo; choose Ask first in the ⋯ menu to approve them instead."
      visible={visible}
      className="flex-1"
      excludeSessionIds={excludeSessionIds}
      onBind={(sessionId) => bindRebuttalAgentSession(scope, sessionId)}
      onLaunch={(agent) => launchRebuttalAgent(scope, agent)}
      toolbar={
        onRequest ? (
          <div className="shrink-0 space-y-1.5 border-b border-border px-3 py-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Rebuttal requests">
              {REBUTTAL_QUICK_ACTIONS.map(({ request, label }) => (
                <Button
                  key={label}
                  size="xs"
                  variant="outline"
                  disabled={sending !== null}
                  onClick={() => void send(request, label)}
                >
                  {sending === label ? 'Sending…' : label}
                </Button>
              ))}
              <ResearchRebuttalTurnChips actor="author" />
            </div>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : null
      }
    />
  )
}
