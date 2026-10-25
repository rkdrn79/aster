import { createBrowserUuid } from '@/lib/browser-uuid'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import type { ResearchHarnessLocation } from '../../../../shared/research/research-harness-results'
import type { ResearchLoopStartParams } from '../../../../preload/api/research-harness-bridge'
import { CLI_NAME } from '../../../../shared/product-brand'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { useResearchRecords } from './research-records-store'
import { trackDelegationLaunch } from './research-delegation-launch'
import { createCatalogExperiment } from './research-experiment-catalog-import'
import type { selectResearchWorkspaceContext } from './research-workspace-context'
import { researchHarnessBridge } from './use-research-harness-experiment'
import { nameResearchChat, researchChatTitle } from './research-chat-label'

export type ResearchLoopContract = Omit<ResearchLoopStartParams, 'workspacePath'>

/**
 * The coordinator's first message. It names the skill files and CLI by absolute path because the
 * skills may not be installed for this agent.
 */
export function researchLoopPrompt(
  harness: ResearchHarnessLocation,
  contract: ResearchLoopContract,
  objectiveEntryId: string
): string {
  const cli = `node "${harness.cli}"`
  const slug = contract.experiment
  const better = contract.direction === 'minimize' ? 'lower' : 'higher'
  const parallel =
    contract.maxParallel === 1 ? '1 run at a time' : `up to ${contract.maxParallel} runs at a time`
  const body = [
    'Run a budgeted research loop in this project. Follow the aster-research-loop skill, which builds on aster-research-track.',
    `If those skills are not installed, read ${harness.loopSkill} and ${harness.trackSkill} first. Read ${harness.verifySkill} before reporting a result.`,
    `Use the research harness CLI as \`${cli}\` (add --json when you parse its output).`,
    '',
    `The loop contract is already recorded as ${objectiveEntryId} in experiment ${slug}; do not record another objective.`,
    `- Objective: ${contract.objective}`,
    `- Primary metric: ${contract.metric}, ${better} is better`,
    `- Budget: at most ${contract.maxRuns} runs and ${contract.maxHours} hours, ${parallel}`,
    `- Compute policy: ${contract.gpuPolicy}`,
    '- Stop when the budget is used, the objective is met, or 3 runs in a row bring no improvement.',
    '',
    `Start with \`${cli} loop show --experiment ${slug} --json\`, \`${cli} context --experiment ${slug}\`, and \`${cli} preflight --experiment ${slug} --loop --json\`.`,
    `Launch every run with \`${cli} run exec --experiment ${slug} ...\` and record hypothesis, run, result and decision notes with \`loop note\`.`,
    `Before a result or loop conclusion, run \`${cli} verify --experiment ${slug} --json\`; checks_clear means only that automated checks found no open issue.`,
    `To wait for a run, use \`${CLI_NAME} research watch --run <experiment>/<run> --on failed,stall:30 --notify self\` and check it with \`${CLI_NAME} research status --run <experiment>/<run> --json\` when \`${CLI_NAME} research --help\` lists them; otherwise check \`run show\` at intervals.`,
    contract.maxParallel > 1
      ? "Run independent hypotheses in parallel through Aster's orchestration as the skill describes, never more than the limit above."
      : null,
    'Stop and ask me before exceeding the budget, changing the evaluation or metric, or continuing after three failed runs in a row.'
  ]
    .filter((line) => line !== null)
    .join('\n')
  return withAsterContext(
    `Run a research loop on ${slug}: ${contract.objective} (${contract.metric}, ${better} is better; at most ${contract.maxRuns} runs and ${contract.maxHours} hours).`,
    { label: `${slug} · loop contract`, body }
  )
}

type LoopCoordinator = {
  workspaceId: string
  hostId: ExecutionHostId
  workspaceLabel: string
  experimentId: string | null
  agent: TuiAgent
  surface: 'chat' | 'terminal'
  objective: string
  prompt: string
}

/** Opens the coordinator chat in the current workspace and lists it under Background agent tasks. */
async function launchResearchLoopCoordinator({
  workspaceId,
  hostId,
  workspaceLabel,
  experimentId,
  agent,
  surface,
  objective,
  prompt
}: LoopCoordinator): Promise<void> {
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    requestedSurface: surface,
    selectedExecutionHostId: hostId,
    agent,
    worktreeId: workspaceId,
    prompt,
    promptDelivery: surface === 'chat' ? 'auto-submit' : 'submit-after-ready',
    activate: false
  })
  if (!result) {
    throw new Error('The agent could not be started. Check it in Settings.')
  }
  nameResearchChat(workspaceId, result, researchChatTitle('Research loop', objective))
  const now = new Date().toISOString()
  const delegation: ResearchDelegationRecord = {
    id: createBrowserUuid(),
    sourceWorkspaceId: workspaceId,
    sourceHostId: hostId,
    sourceExperimentId: experimentId,
    targetWorkspaceId: workspaceId,
    targetHostId: hostId,
    targetLabel: workspaceLabel,
    agent,
    task: `Research loop: ${objective}`.slice(0, 240),
    tabId: result.surface.kind === 'host-published' ? null : result.surface.tabId,
    sessionId: null,
    state: 'launching',
    createdAt: now,
    updatedAt: now
  }
  await useResearchRecords.getState().update((current) => ({
    ...current,
    delegations: [delegation, ...current.delegations].slice(0, 500)
  }))
  trackDelegationLaunch(delegation.id, result)
}

/**
 * Creates the Experiment when it is new, records the contract as the loop's objective note, and
 * starts a coordinator agent that follows the loop skill.
 */
export async function startResearchLoop({
  context,
  newExperimentName,
  contract,
  agent,
  surface
}: {
  context: ReturnType<typeof selectResearchWorkspaceContext>
  /** Set to create a new Experiment; otherwise `contract.experiment` names an existing slug. */
  newExperimentName: string | null
  contract: ResearchLoopContract
  agent: TuiAgent
  surface: 'chat' | 'terminal'
}): Promise<void> {
  const { workspaceId, workspacePath, hostId } = context
  const harness = researchHarnessBridge()
  if (
    !workspaceId ||
    !workspacePath ||
    hostId !== 'local' ||
    !harness.location ||
    !harness.loopStart
  ) {
    throw new Error('Research loops run in local projects for now.')
  }
  const location = await harness.location()
  const experiment = newExperimentName
    ? await createCatalogExperiment(context, newExperimentName)
    : contract.experiment
  const note = await harness.loopStart({ workspacePath, ...contract, experiment })
  const experimentId =
    useResearchRecords
      .getState()
      .document?.experiments.find(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.hostId === hostId &&
          entry.catalogSlug === note.experiment
      )?.id ?? null
  await launchResearchLoopCoordinator({
    workspaceId,
    hostId,
    workspaceLabel: context.workspaceName ?? context.projectName ?? 'This workspace',
    experimentId,
    agent,
    surface,
    objective: contract.objective,
    prompt: researchLoopPrompt(location, { ...contract, experiment: note.experiment }, note.entryId)
  })
}
