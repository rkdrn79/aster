import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { basename } from '@/lib/path'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { useResearchRecords } from './research-records-store'
import { launchResearchBackgroundAgent } from './research-background-agent-launch'
import { researchErrorText } from './research-error-text'
import { sampleJudgePrompt, type SampleJudgeTarget } from './research-sample-judge-prompt'
import { researchHarnessBridge } from './use-research-harness-experiment'
import { researchChatTitle } from './research-chat-label'

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
    const records = useResearchRecords.getState().document
    const started = await launchResearchBackgroundAgent(
      {
        agent,
        hostId: host.id,
        workspaceId: input.workspaceId,
        surface: 'chat',
        prompt: sampleJudgePrompt({
          cli: harness.cli,
          provider: JUDGE_PROVIDERS[agent] ?? agent,
          ...(await briefRubric(input.workspacePath, experiment)),
          target
        }),
        promptDelivery: 'auto-submit',
        label: researchChatTitle('Judge', experiment),
        noFallbackTerminal: true
      },
      {
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
        task: `Judge outputs: ${experiment}`
      }
    )
    if (!started.ok) {
      return started.stage === 'record'
        ? `The judge started, but its Background task link was not saved. ${started.error}`
        : 'The judge could not start on this host.'
    }
    return null
  } catch (cause) {
    return `The judge could not start. ${researchErrorText(cause)}`
  }
}
