import { useCallback, useEffect, useState } from 'react'
import type { ProposalDelivery } from '@/features/research/research-proposal-delivery'
import { researchErrorText } from '@/features/research/research-error-text'
import {
  hostResearchDecisionsSupport,
  isOldHostError,
  listHostProposals
} from '@/web/web-research-decisions'
import type { ResearchProposal } from '../../../shared/research/research-proposals'
import {
  commentOnPhoneProposal,
  decidePhoneProposal,
  proposalDeliveryText
} from './phone-proposal-actions'
import { refreshPhoneDecisions } from './phone-research-decisions'

export type PhoneProposalState = {
  proposal: ResearchProposal | null
  status: 'loading' | 'ready' | 'missing' | 'update-needed' | 'error'
  error: string | null
  busy: 'approved' | 'rejected' | 'comment' | null
  /** What happened after the last action, for the person to read. */
  outcome: string | null
  delivery: ProposalDelivery | null
  decide: (decision: 'approved' | 'rejected', note: string) => Promise<boolean>
  comment: (text: string) => Promise<boolean>
}

/** One proposal read from the host, with the person's Approve, Reject and comment. */
export function usePhoneProposal(ref: {
  worktreeId: string
  experiment: string
  proposal: string
}): PhoneProposalState {
  const { worktreeId, experiment, proposal: id } = ref
  const [proposal, setProposal] = useState<ResearchProposal | null>(null)
  const [status, setStatus] = useState<PhoneProposalState['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<PhoneProposalState['busy']>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [delivery, setDelivery] = useState<ProposalDelivery | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      if ((await hostResearchDecisionsSupport()) === 'update-needed') {
        if (active) {
          setStatus('update-needed')
        }
        return
      }
      try {
        const { proposals } = await listHostProposals(worktreeId, { state: 'all', experiment })
        const found = proposals.find((entry) => entry.id === id) ?? null
        if (active) {
          setProposal(found)
          setStatus(found ? 'ready' : 'missing')
        }
      } catch (cause) {
        if (active) {
          setStatus(isOldHostError(cause) ? 'update-needed' : 'error')
          setError(researchErrorText(cause))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [worktreeId, experiment, id])

  const decide = useCallback(
    async (decision: 'approved' | 'rejected', note: string): Promise<boolean> => {
      if (!proposal || busy) {
        return false
      }
      setBusy(decision)
      setError(null)
      try {
        const decided = await decidePhoneProposal(worktreeId, proposal, decision, note)
        setProposal(decided.proposal)
        setDelivery(decided.delivery)
        setOutcome(proposalDeliveryText(decided.proposal, decided.delivery))
        void refreshPhoneDecisions(worktreeId, true)
        return true
      } catch (cause) {
        setError(researchErrorText(cause))
        return false
      } finally {
        setBusy(null)
      }
    },
    [proposal, busy, worktreeId]
  )

  const comment = useCallback(
    async (text: string): Promise<boolean> => {
      if (!proposal || busy || !text.trim()) {
        return false
      }
      setBusy('comment')
      setError(null)
      const sent = await commentOnPhoneProposal(worktreeId, proposal, text)
      setBusy(null)
      setDelivery(sent)
      if (sent.state === 'sent') {
        setOutcome(`Asked “${sent.to}”. The proposal stays pending.`)
        return true
      }
      setError(
        sent.state === 'failed' ? sent.message : 'The agent that proposed it is not open now.'
      )
      return false
    },
    [proposal, busy, worktreeId]
  )

  return { proposal, status, error, busy, outcome, delivery, decide, comment }
}
