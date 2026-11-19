// Why capabilities: hosts before these answer unknown-method, so a client hides the feature and
// says the server needs an update instead of failing on tap.

/** `researchProposals.list/decide` and `researchPlans.list/overview/budget/approve`. */
export const RESEARCH_DECISIONS_RUNTIME_CAPABILITY = 'research.decisions.v1' as const

export const RESEARCH_RUNTIME_CAPABILITIES = [RESEARCH_DECISIONS_RUNTIME_CAPABILITY] as const
