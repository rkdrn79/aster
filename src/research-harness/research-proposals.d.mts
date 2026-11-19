// Results are `unknown`: callers validate them with the schemas in shared/research/research-proposals.ts.

/** `proposal list`: one Experiment's proposals with their derived state. */
export function listProposals(
  projectPath: string,
  experiment: string,
  options?: { state?: string }
): Promise<unknown>

/** The user's approval or rejection of a pending proposal; refused unless `by` is `'user'`. */
export function decideProposal(
  projectPath: string,
  input: {
    experiment?: string | null
    id: string
    decision: 'approved' | 'rejected'
    note: string | null
    by: 'user'
  }
): Promise<unknown>
