import type { RebuttalReplyProposal } from '../../../../research-harness/research-rebuttal-records.mjs'
import { ResearchRebuttalAgentEditMark } from './ResearchRebuttalAgentEditMark'
import { ResearchRebuttalProposalCard } from './ResearchRebuttalProposalCard'
import type { RebuttalActions } from './use-research-rebuttal-actions'

/**
 * The agent's latest text for one reply, shown under it: a quiet mark with Undo once it is in the
 * reply, held while the person types over it, or a suggestion card when it waits for them.
 */
export function ResearchRebuttalProposalSlot({
  proposal,
  current,
  editingBase,
  readOnly,
  actions
}: {
  proposal: RebuttalReplyProposal
  /** The reply as saved. */
  current: string
  /** What the person's unsaved typing started from, or null when nothing is unsaved. */
  editingBase: string | null
  readOnly: boolean
  actions: Pick<RebuttalActions, 'acceptProposal' | 'discardProposal'>
}): React.JSX.Element {
  if (proposal.applied) {
    return (
      <ResearchRebuttalAgentEditMark
        proposal={proposal}
        held={editingBase !== null && editingBase !== proposal.text}
        readOnly={readOnly}
        onUndo={() => actions.discardProposal(proposal.id)}
        onDismiss={() => actions.acceptProposal(proposal.id)}
      />
    )
  }
  return (
    <ResearchRebuttalProposalCard
      proposal={proposal}
      current={current}
      readOnly={readOnly}
      onAccept={() => actions.acceptProposal(proposal.id)}
      onDiscard={() => actions.discardProposal(proposal.id)}
    />
  )
}
