import { buildProposalDecisionMessage } from '@/features/research/research-agent-review-prompt'
import {
  deliverToProposingAgent,
  type ProposalDelivery
} from '@/features/research/research-proposal-delivery'
import { decideHostProposal } from '@/web/web-research-decisions'
import { CLI_NAME } from '../../../shared/product-brand'
import type { ResearchProposal } from '../../../shared/research/research-proposals'

// Why the host's own CLI: the agent runs on the paired host, whose harness path the phone never sees.
const HOST_HARNESS_CLI = `$(${CLI_NAME} research harness-path)`

/** What the desktop tells the proposing agent about a decision, with the host's harness path. */
export function phoneProposalDecisionMessage(proposal: ResearchProposal): string {
  if (!proposal.decision) {
    throw new Error('This proposal has no decision to send.')
  }
  return buildProposalDecisionMessage({
    proposal,
    decision: proposal.decision.decision,
    note: proposal.decision.note,
    cli: HOST_HARNESS_CLI
  })
}

/** A question or remark that leaves the proposal pending. */
export function phoneProposalCommentMessage(proposal: ResearchProposal, comment: string): string {
  return [
    `[Aster] The user commented on proposal ${proposal.id} in Experiment ${proposal.experiment}: ${JSON.stringify(proposal.title)}.`,
    `Comment: ${JSON.stringify(comment.trim())}`,
    'The proposal is still pending, so do not launch it. Answer the user here; if the proposal should change, record a new one and wait for the decision.'
  ].join('\n')
}

export type PhoneProposalDecided = { proposal: ResearchProposal; delivery: ProposalDelivery }

/** Records the person's decision on the host, then tells the proposing agent, as the desktop does. */
export async function decidePhoneProposal(
  worktreeId: string,
  proposal: ResearchProposal,
  decision: 'approved' | 'rejected',
  note: string
): Promise<PhoneProposalDecided> {
  const { proposal: decided } = await decideHostProposal(worktreeId, {
    experiment: proposal.experiment,
    id: proposal.id,
    decision,
    note: note.trim() || null
  })
  const delivery = await deliverToProposingAgent(worktreeId, decided, async () =>
    phoneProposalDecisionMessage(decided)
  )
  return { proposal: decided, delivery }
}

export function commentOnPhoneProposal(
  worktreeId: string,
  proposal: ResearchProposal,
  comment: string
): Promise<ProposalDelivery> {
  return deliverToProposingAgent(worktreeId, proposal, async () =>
    phoneProposalCommentMessage(proposal, comment)
  )
}

/** One line for the decision's outcome, or null when nobody needed telling. */
export function proposalDeliveryText(
  proposal: ResearchProposal,
  delivery: ProposalDelivery
): string | null {
  if (delivery.state === 'sent') {
    return `Told “${delivery.to}”.`
  }
  if (delivery.state === 'failed') {
    return `The proposing agent was not told: ${delivery.message}`
  }
  if (proposal.state === 'rejected') {
    return 'The proposing agent’s session is not open; the rejection is recorded.'
  }
  return proposal.needsCode
    ? 'Approved. It needs a code change, so hand it to an agent in this project.'
    : 'The agent that proposed it is not open. Hand it to an agent to launch it.'
}
