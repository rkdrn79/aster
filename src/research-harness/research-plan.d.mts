// Results are `unknown`: callers validate them with the schemas in shared/research/research-plans.ts.

/** `plan list`: the project's plans with their status and revision. */
export function listPlans(projectPath: string): Promise<unknown>

/** The person's compute statement for a plan; refused unless `by` is `'user'`. */
export function setPlanBudget(
  projectPath: string,
  id: string,
  input: { gpuHours: number; hardware?: string; by: 'user' }
): Promise<unknown>
