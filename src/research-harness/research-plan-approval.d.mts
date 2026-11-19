// Results are `unknown`: callers validate them with the schemas in shared/research/research-plans.ts.

/** Everything the Plan view shows, computed in one read. */
export function planOverview(projectPath: string, id: string): Promise<unknown>

/** The person's approval with its cuts and "ask" decisions; refused unless `by` is `'user'`. */
export function approvePlan(
  projectPath: string,
  id: string,
  input: {
    revision: number
    cuts: { cell: string; reason: string }[]
    decisions: { request: string; decision: 'include' | 'out-of-scope'; reason: string | null }[]
    by: 'user'
  }
): Promise<unknown>
