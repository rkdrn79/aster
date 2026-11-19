import { useCallback, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { ResearchAgentChatPane } from './ResearchAgentChatPane'
import { ResearchWritingQuickChips, ResearchWritingStarters } from './ResearchWritingQuickActions'
import { ResearchWritingSkeletonPanel } from './ResearchWritingSkeletonPanel'
import { bindWritingAgentSession, launchWritingAgent } from './research-writing-agent-session'
import { useResearchRecords } from './research-records-store'
import {
  buildWritingMessageContext,
  buildWritingQuickPrompt,
  type WritingQuickRequest
} from './research-writing-agent-prompts'
import {
  boundWritingSessionId,
  sendWritingPrompt,
  withWritingMessageContext,
  writingPromptContext
} from './research-writing-agent-requests'
import { writingQuickActions, type WritingQuickActionId } from './research-writing-quick-actions'
import { useWritingTexSelection } from './research-writing-tex-selection'
import { researchHarnessBridge } from './use-research-harness-experiment'
import { useResearchWritingSkeletons } from './use-research-writing-skeletons'

export const WRITING_COMPOSER_PLACEHOLDER = 'Ask for a draft, a revision or a check…'

/** The project's Writing chat, with quick requests and the skeleton the person confirms. */
export function ResearchWritingAgentPane({
  experiment,
  visible,
  onOpenCheck
}: {
  experiment: ExperimentRecord
  visible: boolean
  /** Opens the Writing check drawer (the "Check writing" action). */
  onOpenCheck?: () => void
}): React.JSX.Element {
  const boundSessionId = useResearchRecords((state) =>
    boundWritingSessionId(state.document, experiment)
  )
  const selection = useWritingTexSelection(experiment.workspaceId)
  const skeletons = useResearchWritingSkeletons(experiment, visible)
  const [sending, setSending] = useState<WritingQuickActionId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const decorateMessage = useCallback(
    (sessionId: string, text: string) =>
      withWritingMessageContext(
        sessionId,
        text,
        buildWritingMessageContext(writingPromptContext(experiment))
      ),
    [experiment]
  )
  const actions = writingQuickActions({
    hasManuscript: Boolean(experiment.manuscript),
    hasSelection: Boolean(selection),
    harness: experiment.hostId === 'local' && Boolean(researchHarnessBridge().writingCheck)
  }).map((action) =>
    action.id === 'check' && !onOpenCheck
      ? { ...action, disabledReason: 'Open the Writing page to check the manuscript.' }
      : action
  )

  async function request(
    id: WritingQuickActionId,
    quick: WritingQuickRequest
  ): Promise<string | null> {
    setSending(id)
    setError(null)
    const context = writingPromptContext(experiment)
    const failure = await sendWritingPrompt(
      experiment,
      buildWritingQuickPrompt(context, quick),
      buildWritingMessageContext(context).key
    )
    setSending(null)
    setError(failure)
    void skeletons.refresh()
    return failure
  }

  function run(id: Exclude<WritingQuickActionId, 'method-from-code'>): void {
    switch (id) {
      case 'check':
        onOpenCheck?.()
        return
      case 'tighten':
        if (selection) {
          void request(id, { kind: 'tighten', selection })
        }
        return
      case 'intro-from-skeleton':
      case 'results-from-runs':
        void request(id, { kind: id })
    }
  }

  const method = (folders: string[]): Promise<string | null> =>
    request('method-from-code', { kind: 'method-from-code', folders })
  const owner = { hostId: experiment.hostId, workspacePath: experiment.workspacePath }
  const errorLine = error ? (
    <p role="alert" className="mt-2 text-xs text-destructive">
      {error}
    </p>
  ) : null

  return (
    <ResearchAgentChatPane
      workspaceId={experiment.workspaceId}
      hostId={experiment.hostId}
      boundSessionId={boundSessionId}
      home={{ kind: 'writing', experimentId: null }}
      title="Writing agent"
      sessionLabel="Writing agent session"
      composerPlaceholder={WRITING_COMPOSER_PLACEHOLDER}
      emptyHint={
        <div className="flex w-full max-w-xs flex-col items-stretch gap-2">
          <p className="text-sm text-muted-foreground">
            Start a writing chat for drafts and revisions, or begin with a request.
          </p>
          <ResearchWritingStarters
            owner={owner}
            actions={actions}
            sending={sending}
            onRun={run}
            onMethod={method}
          />
          {errorLine}
        </div>
      }
      visible={visible}
      className="research-pane-in border-r border-border"
      onBind={(sessionId) => bindWritingAgentSession(experiment, sessionId)}
      onLaunch={(agent) => launchWritingAgent(experiment, agent)}
      decorateMessage={decorateMessage}
      toolbar={
        <>
          {boundSessionId ? (
            <div className="shrink-0 px-3 pt-3 pb-0.5">
              <ResearchWritingQuickChips
                owner={owner}
                actions={actions}
                sending={sending}
                onRun={run}
                onMethod={method}
              />
              {errorLine}
            </div>
          ) : null}
          <ResearchWritingSkeletonPanel experiment={experiment} skeletons={skeletons} />
        </>
      }
    />
  )
}
