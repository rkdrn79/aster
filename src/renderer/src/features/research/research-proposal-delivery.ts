import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import {
  recordedAgentTarget,
  sendAgentReviewMessage,
  type AgentReviewOutcome
} from './research-agent-review-launch'
import { buildProposalDecisionMessage } from './research-agent-review-prompt'
import { sendToExperimentChat } from './research-experiment-agent-chat'
import { researchErrorText } from './research-error-text'
import { researchHarnessBridge } from './use-research-harness-experiment'

export type ProposalDelivery =
  | { state: 'sent'; to: string }
  | { state: 'no-session' }
  | { state: 'failed'; message: string }

async function decisionMessage(proposal: ResearchProposal): Promise<string> {
  const location = researchHarnessBridge().location
  if (!proposal.decision || !location) {
    throw new Error('This proposal has no decision to send.')
  }
  return buildProposalDecisionMessage({
    proposal,
    decision: proposal.decision.decision,
    note: proposal.decision.note,
    cli: (await location()).cli
  })
}

/** Tells the proposing agent about the user's decision when its session is still open. */
export async function deliverProposalDecision(
  experiment: ExperimentRecord,
  proposal: ResearchProposal
): Promise<ProposalDelivery> {
  const found = recordedAgentTarget(experiment.workspaceId, proposal.agent)
  if (!found) {
    return { state: 'no-session' }
  }
  try {
    const outcome = await sendAgentReviewMessage(
      found.workspaceId,
      found.target,
      await decisionMessage(proposal)
    )
    return outcome.ok
      ? { state: 'sent', to: found.target.tabTitle || 'the proposing agent' }
      : { state: 'failed', message: outcome.message }
  } catch (cause) {
    return { state: 'failed', message: researchErrorText(cause) }
  }
}

/** Hands an approved config-only proposal to the Experiment's docked chat to launch. */
export async function sendApprovedProposalToExperimentChat(
  experiment: ExperimentRecord,
  proposal: ResearchProposal
): Promise<AgentReviewOutcome> {
  try {
    return await sendToExperimentChat(experiment, await decisionMessage(proposal))
  } catch (cause) {
    return { ok: false, message: researchErrorText(cause) }
  }
}
