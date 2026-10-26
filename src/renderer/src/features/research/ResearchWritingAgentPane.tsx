import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import { bindWritingAgentSession, launchWritingAgent } from './research-writing-agent-session'

export function ResearchWritingAgentPane({
  experiment,
  projectOnly = false,
  visible
}: {
  experiment: ExperimentRecord
  /** A project without Experiments has no record to keep a Writing chat on yet. */
  projectOnly?: boolean
  visible: boolean
}): React.JSX.Element {
  if (projectOnly) {
    return (
      <div
        className="min-h-0 min-w-0 flex-col border-r border-border"
        style={{ display: visible ? 'flex' : 'none' }}
      >
        <div className="flex shrink-0 items-center border-b border-border px-3 py-1.5">
          <h2 className="text-xs font-semibold">Writing agent</h2>
        </div>
        <p className="m-auto max-w-64 p-6 text-center text-xs text-muted-foreground">
          Select text in the PDF and choose Revise to start a background revision on this project.
          Create an Experiment to keep a persistent Writing chat here.
        </p>
      </div>
    )
  }
  return (
    <ResearchAgentChatPane
      workspaceId={experiment.workspaceId}
      hostId={experiment.hostId}
      boundSessionId={experiment.writingAgentSessionId}
      home={{ kind: 'writing', experimentId: experiment.id }}
      title="Writing agent"
      sessionLabel="Writing agent session"
      emptyHint="Start a writing chat for manuscript revisions. To continue an earlier chat, use the menu above."
      visible={visible}
      className="border-r border-border"
      onBind={(sessionId) => bindWritingAgentSession(experiment, sessionId)}
      onLaunch={(agent) => launchWritingAgent(experiment, agent)}
    />
  )
}
