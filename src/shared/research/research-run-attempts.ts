/** Where a Run stands among Runs of one Experiment that share its name. */
export type ResearchRunAttempt = { attempt: number; of: number }

type AttemptRun = { id: string; name: string; createdAt: string }

/**
 * Runs that share a name are attempts at the same thing (a rerun keeps the name), numbered by
 * when they were created. Runs with a unique name are left out. Mirrors runAttempts in the
 * research harness, which marks a failed attempt superseded once a later one succeeds.
 */
export function researchRunAttempts(
  runs: readonly AttemptRun[]
): ReadonlyMap<string, ResearchRunAttempt> {
  const byName = new Map<string, AttemptRun[]>()
  for (const run of runs) {
    const name = run.name.trim()
    byName.set(name, [...(byName.get(name) ?? []), run])
  }
  const attempts = new Map<string, ResearchRunAttempt>()
  for (const group of byName.values()) {
    if (group.length < 2) {
      continue
    }
    const ordered = group.toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    )
    ordered.forEach((run, index) => attempts.set(run.id, { attempt: index + 1, of: group.length }))
  }
  return attempts
}

/** Keeps attempts of one name next to each other, in the order their names first appear. */
export function groupResearchRunAttempts<T extends AttemptRun>(runs: readonly T[]): T[] {
  const order = new Map<string, number>()
  runs.forEach((run, index) => {
    if (!order.has(run.name.trim())) {
      order.set(run.name.trim(), index)
    }
  })
  return runs
    .map((run, index) => ({ run, index }))
    .toSorted(
      (left, right) =>
        (order.get(left.run.name.trim()) ?? 0) - (order.get(right.run.name.trim()) ?? 0) ||
        left.index - right.index
    )
    .map(({ run }) => run)
}
