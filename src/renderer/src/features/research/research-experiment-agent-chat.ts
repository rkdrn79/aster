import { create } from 'zustand'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { launchResearchChat } from './ResearchAgentChatPane'
import {
  loadAgentReviewSetup,
  researchChatTab,
  reviewChatAgent,
  sendToResearchChat,
  type AgentReviewOutcome,
  type AgentReviewScope
} from './research-agent-review-launch'
import {
  buildAgentReviewPrompt,
  type AgentReviewSetup,
  type AgentReviewTarget
} from './research-agent-review-prompt'
import { researchConversationHomeKey } from './research-conversation-home'
import { linkResearchConversation } from './research-conversation-link'
import { useResearchRecords } from './research-records-store'
import { harnessExperimentSlug } from './use-research-harness-experiment'
import { researchChatTitle } from './research-chat-label'
import {
  analysisAddCommand,
  experimentChatIntro,
  experimentRequest,
  proposalAddCommand
} from './research-experiment-agent-requests'

/** Whether each Experiment's docked chat is shown; open unless the user closed it. */
export const useExperimentChatPanel = create<{
  closedIds: Record<string, boolean>
  setOpen: (experimentId: string, open: boolean) => void
}>((set) => ({
  closedIds: {},
  setOpen: (experimentId, open) =>
    set((state) => ({ closedIds: { ...state.closedIds, [experimentId]: !open } }))
}))

/** Where an Experiment's agent works: its catalog slug in a local project, else null. */
export function experimentChatScope(experiment: ExperimentRecord): AgentReviewScope | null {
  const slug = harnessExperimentSlug(experiment)
  return slug
    ? {
        workspaceId: experiment.workspaceId,
        hostId: experiment.hostId,
        workspacePath: experiment.workspacePath,
        experiment: slug,
        name: experiment.name
      }
    : null
}

/** What the notebook and the docked chat ask the experiment agent for. */
export type ExperimentChatRequest =
  | 'design'
  | 'analyze'
  | 'explain-failure'
  | 'next-run'
  | 'full-review'
  | 'draft-conclusion'

export function experimentChatPrompt(
  request: ExperimentChatRequest,
  setup: AgentReviewSetup
): string {
  const slug = setup.experiment
  switch (request) {
    case 'design':
      return experimentRequest(
        setup,
        'Help me design this experiment.',
        'design',
        `Help me design this experiment. From the brief, the Runs, and the code, suggest: the question, a falsifiable hypothesis, the primary metric with its split and direction, the baseline Run, the minimum seeds, and the first Runs to make. Ask me what you cannot infer. Once I agree, write the plan with \`brief set --experiment ${slug} … --by agent\` and propose each Run with \`${proposalAddCommand(setup)}\` (--needs-code when the code must change). Do not launch anything yet.`
      )
    case 'analyze':
      return experimentRequest(
        setup,
        'Analyze the results against the brief.',
        'analysis',
        `Analyze the results against the brief: compare each Run with the baseline on the primary metric, group Runs that differ only in their seed, and assess the evidence for any difference. Find <record-root> from the catalog path in context (.aster/ or legacy research/). Make the figure or table that addresses the question, save it under <record-root>/experiments/${slug}/analysis/, and record it with \`${analysisAddCommand(setup)}\`. Reply with the takeaway and limitations in one paragraph.`
      )
    case 'explain-failure':
      return experimentRequest(
        setup,
        'Explain the failed, stalled, or suspicious Runs.',
        'failures',
        'Explain the failed, stalled, or suspicious Runs: read their run.json, log tails, and metrics, and give the likely cause with file and line evidence. Record evidence-backed problems with `quality add`. If a code change would fix it, propose the rerun with `proposal add … --needs-code`; do not edit code here.'
      )
    case 'next-run':
      return experimentRequest(
        setup,
        'Suggest the most informative next Run.',
        'next run',
        `Suggest the single most informative next Run and why. Follow the brief's proposals policy: under approval, record it with \`${proposalAddCommand(setup)}\` (--needs-code when the code must change) and wait for my decision.`
      )
    case 'full-review':
      return buildAgentReviewPrompt(setup, { kind: 'experiment' })
    case 'draft-conclusion':
      return experimentRequest(
        setup,
        'Draft the conclusion of this Experiment.',
        'conclusion',
        "Draft the conclusion of this Experiment in three to five sentences: answer the brief's question, name the Runs, seed counts, and analyses it rests on, and say what it does not show. Reply with the draft only. Do not write it to the brief; I edit and save the conclusion myself."
      )
  }
}

/** Why a Run failed, for a failed Run that has no rule finding to triage. */
export function failedRunPrompt(setup: AgentReviewSetup, run: string): string {
  return experimentRequest(
    setup,
    `Diagnose why Run ${run} failed.`,
    `Run ${run}`,
    `Run ${run} failed. Read \`run show ${run} --log-lines 200\`, its run.json, config, and code.patch, and explain the likely cause with file and line evidence. Record evidence-backed problems with \`quality add\`. If a rerun would fix it, propose it with \`proposal add\` (--needs-code when the code must change).`
  )
}

/** The docked chat's one-click requests. */
export const EXPERIMENT_CHAT_QUICK_PROMPTS: readonly {
  label: string
  request: ExperimentChatRequest
}[] = [
  { label: 'Design', request: 'design' },
  { label: 'Analyze', request: 'analyze' },
  { label: 'Explain failure', request: 'explain-failure' },
  { label: 'Next run', request: 'next-run' },
  { label: 'Full review', request: 'full-review' }
]

function currentRecord(experiment: ExperimentRecord): ExperimentRecord {
  return (
    useResearchRecords
      .getState()
      .document?.experiments.find((entry) => entry.id === experiment.id) ?? experiment
  )
}

export async function bindExperimentAgentSession(
  experiment: ExperimentRecord,
  sessionId: string | null
): Promise<void> {
  await useResearchRecords.getState().update((current) => {
    const existing = current.experiments.find(
      (entry) =>
        entry.id === experiment.id &&
        entry.workspaceId === experiment.workspaceId &&
        entry.hostId === experiment.hostId
    )
    if (!existing) {
      throw new Error('This Experiment is no longer available.')
    }
    const conversationHomes = { ...current.conversationHomes }
    for (const id of [existing.experimentAgentSessionId, sessionId]) {
      if (id) {
        conversationHomes[
          researchConversationHomeKey(experiment.hostId, experiment.workspaceId, id)
        ] = { kind: 'experiment', experimentId: experiment.id }
      }
    }
    return {
      ...current,
      conversationHomes,
      experiments: current.experiments.map((entry) =>
        entry.id === experiment.id
          ? {
              ...entry,
              experimentAgentSessionId: sessionId || undefined,
              updatedAt: new Date().toISOString()
            }
          : entry
      )
    }
  })
  const tab = sessionId ? researchChatTab(experiment.workspaceId, sessionId) : undefined
  if (tab) {
    // Why: linking lists the chat under its Experiment in the sidebar, like other conversations.
    await linkResearchConversation(
      { tabId: tab.id, workspaceId: experiment.workspaceId, hostId: experiment.hostId },
      experiment.id
    ).catch(() => undefined)
  }
}

/**
 * Starts the Experiment's docked chat and binds it. A catalog Experiment's chat opens with the
 * intro so the agent knows its role and where it works, then the request when there is one.
 */
export async function launchExperimentAgent(
  experiment: ExperimentRecord,
  agent: TuiAgent,
  request?: string
): Promise<string | null> {
  const scope = experimentChatScope(experiment)
  const first = scope
    ? await loadAgentReviewSetup(scope).then(
        (setup) => experimentChatIntro(setup, experiment.name, request),
        () => request
      )
    : request
  const result = await launchResearchChat({
    hostId: experiment.hostId,
    workspaceId: experiment.workspaceId,
    agent,
    prompt: first,
    label: researchChatTitle(experiment.name, 'agent')
  })
  if ('error' in result) {
    return result.error
  }
  try {
    await bindExperimentAgentSession(experiment, result.sessionId)
    return null
  } catch (cause) {
    return `Experiment chat started but was not linked. ${String(cause)}`
  }
}

/** Sends a message to the Experiment's docked chat, starting one when none is open. */
export async function sendToExperimentChat(
  experiment: ExperimentRecord,
  prompt: string
): Promise<AgentReviewOutcome> {
  useExperimentChatPanel.getState().setOpen(experiment.id, true)
  const record = currentRecord(experiment)
  const sent = record.experimentAgentSessionId
    ? await sendToResearchChat(record.workspaceId, record.experimentAgentSessionId, prompt)
    : null
  if (sent) {
    return sent
  }
  const error = await launchExperimentAgent(record, reviewChatAgent(), prompt)
  return error ? { ok: false, message: error } : { ok: true }
}

/** Builds a request from the Experiment's harness setup and sends it to its docked chat. */
export async function askExperimentChat(
  experiment: ExperimentRecord,
  build: (setup: AgentReviewSetup) => string
): Promise<AgentReviewOutcome> {
  const scope = experimentChatScope(experiment)
  if (!scope) {
    return { ok: false, message: 'Available for local projects with a research catalog.' }
  }
  return sendToExperimentChat(experiment, build(await loadAgentReviewSetup(scope)))
}

/** A triage or review for the Experiment's chat: builds its prompt and sends it there. */
export function askExperimentAgent(
  experiment: ExperimentRecord,
  target: AgentReviewTarget
): Promise<AgentReviewOutcome> {
  return askExperimentChat(experiment, (setup) => buildAgentReviewPrompt(setup, target))
}
