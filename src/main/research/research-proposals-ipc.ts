import { z } from 'zod'
import {
  RESEARCH_PROPOSAL_STATES,
  researchProposalSchema,
  type ResearchProposal,
  type ResearchProposalList
} from '../../shared/research/research-proposals'
import { decideResearchProposal, listResearchProposals } from './research-decision-calls'
import { authorizedProjectPath, callHarness, handle } from './research-harness-ipc'

const EXPERIMENT_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u

const experimentSchema = z
  .object({
    workspacePath: z.string().min(1).max(4096),
    experiment: z.string().regex(EXPERIMENT_SLUG)
  })
  .strict()
const listSchema = experimentSchema.extend({
  state: z.enum([...RESEARCH_PROPOSAL_STATES, 'all']).optional()
})
const proposalId = z.string().regex(/^proposal-[1-9]\d{0,8}$/u)
const decideSchema = experimentSchema.extend({
  id: proposalId,
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(2000).nullable()
})
const handoffSchema = experimentSchema.extend({
  id: proposalId,
  sessionId: z.string().trim().min(1).max(200).nullable()
})
const decidedSchema = z.object({ proposal: researchProposalSchema })

/** Local catalog projects only; a decision or handoff from the app is always the user's. */
export function registerResearchProposalsIpcHandlers(): void {
  handle('researchProposals:list', listSchema, async (input): Promise<ResearchProposalList> =>
    listResearchProposals(
      {
        listProposals: (project, experiment, options) =>
          callHarness('research-proposals.mjs', 'listProposals', project, experiment, options)
      },
      await authorizedProjectPath(input.workspacePath),
      input.experiment,
      input.state ?? 'all'
    )
  )
  handle(
    'researchProposals:decide',
    decideSchema,
    async (input): Promise<{ proposal: ResearchProposal }> => ({
      proposal: await decideResearchProposal(
        {
          decideProposal: (project, decision) =>
            callHarness('research-proposals.mjs', 'decideProposal', project, decision)
        },
        await authorizedProjectPath(input.workspacePath),
        input
      )
    })
  )
  handle(
    'researchProposals:handoff',
    handoffSchema,
    async (input): Promise<{ proposal: ResearchProposal }> => {
      const { proposal } = decidedSchema.parse(
        await callHarness(
          'research-proposals.mjs',
          'handoffProposal',
          await authorizedProjectPath(input.workspacePath),
          {
            experiment: input.experiment,
            id: input.id,
            sessionId: input.sessionId,
            by: 'user'
          }
        )
      )
      return { proposal }
    }
  )
}
