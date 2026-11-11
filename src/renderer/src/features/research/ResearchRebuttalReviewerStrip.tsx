import { ResearchRebuttalPaperChangesBar } from './ResearchRebuttalPaperChangesBar'
import { ResearchRebuttalRegroupList, reviewerRegroups } from './ResearchRebuttalRegroups'
import { ResearchRebuttalWaitingChanges } from './ResearchRebuttalWaitingChanges'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { reviewerAnswers, reviewerRounds } from './research-rebuttal-view'
import type { RebuttalActions } from './use-research-rebuttal-actions'

/** Above a reviewer's replies: the agent's recent edits, regroups and waiting paper changes. */
export function ResearchRebuttalReviewerStrip({
  snapshot,
  reviewerId,
  readOnly,
  actions
}: {
  snapshot: RebuttalSnapshot
  reviewerId: string
  readOnly: boolean
  actions: RebuttalActions
}): React.JSX.Element | null {
  const slots = new Set(
    reviewerRounds(snapshot.bundle, reviewerId)
      .flatMap((round) => reviewerAnswers(snapshot.bundle, reviewerId, round))
      .flatMap((answer) => (answer.cluster ? [answer.cluster.id] : []))
  )
  const proposals = snapshot.proposals.filter((proposal) => slots.has(proposal.slot))
  const paperChanges = snapshot.paperChanges.filter(
    (change) => change.status === 'pending' && slots.has(change.cluster)
  )
  const regroups = reviewerRegroups(snapshot, reviewerId)
  if (!proposals.length && paperChanges.length < 2 && !regroups.length) {
    return null
  }
  return (
    <div className="shrink-0 space-y-1 border-b border-border px-4 py-1.5">
      <ResearchRebuttalRegroupList
        records={regroups}
        archive={snapshot.archive}
        readOnly={readOnly}
        actions={actions}
      />
      <ResearchRebuttalWaitingChanges
        compact
        proposals={proposals}
        readOnly={readOnly}
        actions={actions}
      />
      {paperChanges.length > 1 ? (
        <ResearchRebuttalPaperChangesBar
          changes={paperChanges}
          readOnly={readOnly}
          onApplyAll={actions.approvePaperChanges}
        />
      ) : null}
    </div>
  )
}
