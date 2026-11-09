import { useState } from 'react'
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

type Props = {
  scope: RebuttalAgentScope
  visible: boolean
  /** Null while no rebuttal is open, which hides the quick actions. */
  onRequest: ((request: RebuttalAgentRequest) => Promise<string | null>) | null
}

/** The project's Rebuttal chat, with requests that send a full prompt to it. */
export function ResearchRebuttalAgentPane({ scope, visible, onRequest }: Props): React.JSX.Element {
  const boundSessionId = useResearchRecords((state) =>
    rebuttalAgentSessionId(state.document, scope)
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
      emptyHint="Start a rebuttal chat. The agent splits the reviews into points, groups them, and drafts answers straight into this rebuttal's files."
      visible={visible}
      className="flex-1"
      onBind={(sessionId) => bindRebuttalAgentSession(scope, sessionId)}
      onLaunch={(agent) => launchRebuttalAgent(scope, agent)}
      toolbar={
        onRequest ? (
          <div className="shrink-0 border-b border-border px-3 py-2">
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
            </div>
            {error ? (
              <p role="alert" className="mt-1.5 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : null
      }
    />
  )
}
