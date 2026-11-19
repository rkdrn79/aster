import { describe, expect, it } from 'vitest'
import type { ResearchProposal } from '../../../shared/research/research-proposals'
import { phoneProposalCommentMessage, phoneProposalDecisionMessage } from './phone-proposal-actions'

const proposal: ResearchProposal = {
  id: 'proposal-2',
  at: '2026-11-01T00:00:00.000Z',
  experiment: 'denoiser-samples',
  title: 'Run the cosine schedule with seed 2',
  rationale: 'One more seed.',
  command: 'node train.mjs --seed 2',
  cwd: '.',
  configChanges: null,
  findings: [],
  runs: [],
  state: 'approved',
  decision: { decision: 'approved', note: 'Keep 800 steps.', by: 'user', at: '2026-11-02' },
  launchedRun: null,
  needsCode: false,
  handoff: null
}

describe('phone proposal messages', () => {
  it('tells the agent to record the launch with its own host’s harness', () => {
    const message = phoneProposalDecisionMessage(proposal)
    expect(message).toContain('The user approved proposal proposal-2')
    expect(message).toContain('Note from the user: "Keep 800 steps."')
    expect(message).toContain('node "$(aster research harness-path)" proposal launched')
  })

  it('keeps a commented proposal pending', () => {
    const message = phoneProposalCommentMessage({ ...proposal, state: 'pending' }, ' Why 800? ')
    expect(message).toContain('Comment: "Why 800?"')
    expect(message).toContain('still pending, so do not launch it')
  })
})
