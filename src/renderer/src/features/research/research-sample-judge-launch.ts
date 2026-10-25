import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { basename } from '@/lib/path'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import { useResearchRecords } from './research-records-store'
import { trackDelegationLaunch } from './research-delegation-launch'
import { researchErrorText } from './research-error-text'
import { sampleJudgePrompt, type SampleJudgeTarget } from './research-sample-judge-prompt'
import { researchHarnessBridge } from './use-research-harness-experiment'
import { nameResearchChat, researchChatTitle } from './research-chat-label'

// Why: these match agentIdentityFromEnvironment's provider names, so judge groups line up.
const JUDGE_PROVIDERS: Partial<Record<TuiAgent, string>> = { claude: 'claude-code', codex: 'codex' }

function judgeAgent(): TuiAgent {
  const preferred = useAppStore.getState().settings?.defaultTuiAgent
  return preferred && preferred !== 'blank' && JUDGE_PROVIDERS[preferred] ? preferred : 'claude'
}

async function briefRubric(
  workspacePath: string,
  experiment: string
): Promise<{ rubric: string | null; rubricIssue: string | null }> {
  const show = window.api.researchBrief?.show
  if (!show) {
    return { rubric: null, rubricIssue: 'This build cannot read the Experiment brief.' }
  }
  try {
    const { brief } = await show({ workspacePath, experiment })
    if (!brief?.rubric) {
      return { rubric: null, rubricIssue: `The brief of ${experiment} names no rubric.` }
    }
    const file = await window.api.researchRatings.rubric({ workspacePath, path: brief.rubric })
    return file
      ? { rubric: file.path, rubricIssue: null }
      : { rubric: null, rubricIssue: `The brief names ${brief.rubric}, but that file is missing.` }
  } catch (cause) {
    return {
      rubric: null,
      rubricIssue: `The brief of ${experiment} could not be read: ${researchErrorText(cause)}`
    }
  }
}

/** Opens a new agent chat that judges the target's samples; returns an error to show, or null. */
export async function launchSampleJudge(input: {
  hostId: string
  workspaceId: string
  workspacePath: string
  target: SampleJudgeTarget
}): Promise<string | null> {
  const location = researchHarnessBridge().location
  if (!location) {
    return 'This build does not include the research harness.'
  }
  try {
    const harness = await location()
    const target = input.target
    const experiment = target.mode === 'pairwise' ? target.b.experiment : target.runs[0]?.experiment
    if (!experiment) {
      return 'Choose a Run to judge.'
    }
    const host = parseExecutionHostId(input.hostId)
    if (!host) {
      return 'The Run host cannot start an agent.'
    }
    const agent = judgeAgent()
    const result = launchAgentInNewTab({
      requestId: newAgentLaunchRequestId(),
      requestedSurface: 'chat',
      selectedExecutionHostId: host.id,
      agent,
      activate: false,
      onStructuredHostDeclined: () => ({ opened: false }),
      worktreeId: input.workspaceId,
      promptDelivery: 'auto-submit',
      prompt: sampleJudgePrompt({
        cli: harness.cli,
        provider: JUDGE_PROVIDERS[agent] ?? agent,
        ...(await briefRubric(input.workspacePath, experiment)),
        target
      })
    })
    if (!result) {
      return 'The judge could not start on this host.'
    }
    nameResearchChat(input.workspaceId, result, researchChatTitle('Judge', experiment))
    const now = new Date().toISOString()
    const records = useResearchRecords.getState().document
    const task: ResearchDelegationRecord = {
      id: createBrowserUuid(),
      sourceWorkspaceId: input.workspaceId,
      sourceHostId: input.hostId,
      sourceExperimentId:
        records?.experiments.find(
          (entry) =>
            entry.catalogSlug === experiment &&
            entry.hostId === input.hostId &&
            entry.workspaceId === input.workspaceId
        )?.id ?? null,
      targetWorkspaceId: input.workspaceId,
      targetHostId: input.hostId,
      targetLabel: basename(input.workspacePath) || 'Workspace',
      agent,
      task: `Judge outputs: ${experiment}`,
      tabId: result.surface.kind === 'host-published' ? null : result.surface.tabId,
      sessionId: null,
      state: 'launching',
      createdAt: now,
      updatedAt: now
    }
    try {
      await useResearchRecords.getState().update((current) => ({
        ...current,
        delegations: [task, ...current.delegations].slice(0, 500)
      }))
    } catch (cause) {
      return `The judge started, but its Background task link was not saved. ${researchErrorText(cause)}`
    }
    trackDelegationLaunch(task.id, result)
    return null
  } catch (cause) {
    return `The judge could not start. ${researchErrorText(cause)}`
  }
}
