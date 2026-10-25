// Results are `unknown`: callers validate them with the schemas in research-harness-results.ts.

/** `claim audit`: re-reads every claim's evidence and looks for its number in the manuscript. */
export function auditClaims(projectPath: string, options?: { id?: string | null }): Promise<unknown>

/** `claim list`: the project's .aster/claims.json or legacy research/claims.json. */
export function listClaims(projectPath: string): Promise<unknown>

/** `claim scan`: result-like manuscript numbers that no claim's evidence accounts for. */
export function scanUnbackedNumbers(
  projectPath: string,
  options?: { file?: string | null }
): Promise<unknown>
