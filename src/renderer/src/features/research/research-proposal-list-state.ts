import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { openResearchChatTab } from './research-agent-review-launch'
import { handProposalToWorkbench } from './research-handoff-send'
import {
  deliverProposalDecision,
  sendApprovedProposalToExperimentChat,
  type ProposalDelivery
} from './research-proposal-delivery'
import { researchErrorText } from './research-error-text'
import { harnessExperimentSlug } from './use-research-harness-experiment'

const POLL_MS = 10_000
const NO_PROPOSALS: ResearchProposal[] = []

export type ResearchProposalsState = {
  proposals: ResearchProposal[]
  error: string | null
  /** Shows a decision right away instead of waiting for the next read. */
  replace: (proposal: ResearchProposal) => void
}

/** proposals.jsonl of one local catalog Experiment, re-read every 10 s while the window is visible. */
export function useResearchProposals(
  experiment: ExperimentRecord | undefined
): ResearchProposalsState {
  const slug = harnessExperimentSlug(experiment)
  const workspacePath = experiment?.workspacePath ?? null
  const owner = JSON.stringify([workspacePath, slug])
  const [snapshot, setSnapshot] = useState<{
    owner: string
    proposals: ResearchProposal[]
    error: string | null
  } | null>(null)

  useEffect(() => {
    const list = (window.api.researchProposals ?? {}).list
    if (!slug || !workspacePath || !list) {
      return
    }
    let active = true
    let reading = false
    const read = async (): Promise<void> => {
      if (reading) {
        return
      }
      reading = true
      try {
        const { proposals } = await list({ workspacePath, experiment: slug, state: 'all' })
        if (active) {
          setSnapshot({ owner, proposals, error: null })
        }
      } catch (cause) {
        if (active) {
          setSnapshot((previous) => ({
            owner,
            proposals: previous?.owner === owner ? previous.proposals : [],
            error: researchErrorText(cause)
          }))
        }
      } finally {
        reading = false
      }
    }
    const stop = installWindowVisibilityInterval({ run: () => void read(), intervalMs: POLL_MS })
    return () => {
      active = false
      stop()
    }
  }, [owner, slug, workspacePath])

  const replace = useCallback(
    (proposal: ResearchProposal) =>
      setSnapshot((previous) =>
        previous?.owner === owner
          ? {
              ...previous,
              proposals: previous.proposals.map((entry) =>
                entry.id === proposal.id ? proposal : entry
              )
            }
          : previous
      ),
    [owner]
  )

  const current = snapshot?.owner === owner ? snapshot : null
  return useMemo(
    () => ({
      proposals: current?.proposals ?? NO_PROPOSALS,
      error: current?.error ?? null,
      replace
    }),
    [current, replace]
  )
}

export type ResearchProposalDecisions = {
  busyId: string | null
  errors: Readonly<Record<string, string>>
  decide: (proposal: ResearchProposal, decision: 'approved' | 'rejected', note: string) => void
  /** Tells the proposing agent about an approval again. */
  resend: (proposal: ResearchProposal) => void
  /** Hands an approved config-only proposal to the Experiment's docked chat to launch. */
  sendToExperimentChat: (proposal: ResearchProposal) => void
  /** "Implement in Workbench" for an approved `needsCode` proposal. */
  handToWorkbench: (proposal: ResearchProposal, findings: readonly ResearchFinding[]) => void
}

function deliveryToast(
  proposal: ResearchProposal,
  delivery: ProposalDelivery,
  sendToChat: () => void
): void {
  if (delivery.state === 'sent') {
    toast.success(`Told “${delivery.to}” about ${proposal.id}.`)
  } else if (delivery.state === 'failed') {
    toast.error(`${proposal.id}: the proposing agent was not told. ${delivery.message}`)
  } else if (proposal.state === 'rejected') {
    toast.message(`${proposal.id} was rejected. The proposing agent’s session is not open.`)
  } else if (delivery.state === 'no-session' && !proposal.needsCode) {
    // Why: nobody launches an approved config-only Run unless an agent hears about it.
    toast.message(`The agent that proposed ${proposal.id} is not open.`, {
      action: { label: 'Send to experiment chat', onClick: sendToChat }
    })
  }
}

/** Approve and Reject as the user, tell the proposing agent, and hand approved Runs on. */
export function useResearchProposalDecisions(
  experiment: ExperimentRecord | undefined,
  replace: (proposal: ResearchProposal) => void
): ResearchProposalDecisions {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const slug = harnessExperimentSlug(experiment)

  /** One action at a time; a failure shows on the proposal's Needs-you row, or as a toast. */
  async function run(
    proposal: ResearchProposal,
    work: () => Promise<void>,
    report: 'row' | 'toast' = 'row'
  ): Promise<void> {
    if (busyId) {
      return
    }
    setBusyId(proposal.id)
    setErrors(({ [proposal.id]: _cleared, ...rest }) => rest)
    try {
      await work()
    } catch (cause) {
      if (report === 'toast') {
        toast.error(researchErrorText(cause))
      } else {
        setErrors((current) => ({ ...current, [proposal.id]: researchErrorText(cause) }))
      }
    } finally {
      setBusyId(null)
    }
  }

  async function sendToChat(owner: ExperimentRecord, proposal: ResearchProposal): Promise<void> {
    const outcome = await sendApprovedProposalToExperimentChat(owner, proposal)
    if (!outcome.ok) {
      throw new Error(outcome.message)
    }
  }

  return {
    busyId,
    errors,
    decide: (proposal, decision, note) => {
      const decideProposal = (window.api.researchProposals ?? {}).decide
      if (!experiment || !slug || !decideProposal) {
        return
      }
      void run(proposal, async () => {
        const { proposal: decided } = await decideProposal({
          workspacePath: experiment.workspacePath,
          experiment: slug,
          id: proposal.id,
          decision,
          note: note.trim() || null
        })
        replace(decided)
        deliveryToast(decided, await deliverProposalDecision(experiment, decided), () => {
          void run(decided, () => sendToChat(experiment, decided), 'toast')
        })
      })
    },
    resend: (proposal) => {
      if (experiment) {
        void run(
          proposal,
          async () =>
            deliveryToast(proposal, await deliverProposalDecision(experiment, proposal), () => {
              void run(proposal, () => sendToChat(experiment, proposal), 'toast')
            }),
          'toast'
        )
      }
    },
    sendToExperimentChat: (proposal) => {
      if (experiment) {
        void run(proposal, () => sendToChat(experiment, proposal), 'toast')
      }
    },
    handToWorkbench: (proposal, findings) => {
      if (!experiment) {
        return
      }
      void run(proposal, async () => {
        const handoff = await handProposalToWorkbench(experiment, proposal, findings)
        if (!handoff.ok) {
          throw new Error(handoff.message)
        }
        replace(handoff.proposal)
        toast.success(`Handed “${proposal.title}” to ${handoff.label}.`, {
          action: {
            label: 'Open',
            onClick: () => openResearchChatTab(experiment.workspaceId, handoff.sessionId)
          }
        })
      })
    }
  }
}
