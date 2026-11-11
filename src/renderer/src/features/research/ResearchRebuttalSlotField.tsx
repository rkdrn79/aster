import { useState } from 'react'
import { ResearchRebuttalDraftField } from './ResearchRebuttalDraftField'
import { ResearchRebuttalProposalSlot } from './ResearchRebuttalProposalSlot'
import { RebuttalTranslationBlock } from './ResearchRebuttalTranslation'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import type { RebuttalActions } from './use-research-rebuttal-actions'

/**
 * A reply that is not a concern's answer (a reviewer's opening, the general intro or closing),
 * saved and kept in versions like the answers, with the agent's latest edit under it.
 */
export function ResearchRebuttalSlotField({
  snapshot,
  slot,
  label,
  value,
  placeholder,
  rows,
  readOnly,
  actions,
  className
}: {
  snapshot: RebuttalSnapshot
  /** opening:R1, general:intro or general:closing. */
  slot: string
  label: string
  value: string
  placeholder: string
  rows?: number
  readOnly: boolean
  actions: Pick<RebuttalActions, 'saveReply' | 'acceptProposal' | 'discardProposal'>
  className?: string
}): React.JSX.Element {
  const [editingBase, setEditingBase] = useState<string | null>(null)
  const proposal = snapshot.proposals.find((entry) => entry.slot === slot) ?? null
  return (
    <div className={className}>
      <ResearchRebuttalDraftField
        label={label}
        value={value}
        readOnly={readOnly}
        rows={rows}
        placeholder={placeholder}
        onEditingChange={(editing) => setEditingBase(editing?.base ?? null)}
        onSave={(text, base) => actions.saveReply(slot, null, text, base)}
      />
      <RebuttalTranslationBlock tkey={`reply:${slot}`} source={value} className="mt-1.5" />
      {proposal ? (
        <div className="mt-1.5">
          <ResearchRebuttalProposalSlot
            proposal={proposal}
            current={value}
            editingBase={editingBase}
            readOnly={readOnly}
            actions={actions}
          />
        </div>
      ) : null}
    </div>
  )
}
