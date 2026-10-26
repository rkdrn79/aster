import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import { bindWritingAgentSession, launchWritingAgent } from './research-writing-agent-session'
import { useResearchRecords } from './research-records-store'
import { writingAgentScopeKey } from './research-conversation-home'

export function ResearchWritingAgentPane({
  experiment,
  visible
}: {
  experiment: ExperimentRecord
  visible: boolean
}): React.JSX.Element {
  const boundSessionId = useResearchRecords(
    (state) =>
      state.document?.writingAgentSessionByScope[
        writingAgentScopeKey({ hostId: experiment.hostId, workspaceId: experiment.workspaceId })
      ] ?? experiment.writingAgentSessionId
  )
  return (
    <ResearchAgentChatPane
      workspaceId={experiment.workspaceId}
      hostId={experiment.hostId}
      boundSessionId={boundSessionId}
      home={{ kind: 'writing', experimentId: null }}
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
