function launchedAt(run) {
  const manifest = run.manifest
  const value =
    manifest?.launch?.startedAt ?? manifest?.harness?.createdAt ?? manifest?.execution?.observedAt
  const time = Date.parse(value ?? '')
  return Number.isFinite(time) ? time : 0
}

/**
 * Runs of one Experiment that share a name are attempts at the same thing, oldest first. Maps each
 * repeated Run's reference to its attempt number and the first later attempt that succeeded.
 * `runs` are `{ ref, state, manifest }`; Runs with a unique name are left out.
 */
export function runAttempts(runs) {
  const byName = new Map()
  for (const run of runs) {
    const name = typeof run.manifest?.name === 'string' ? run.manifest.name.trim() : ''
    if (name) {
      byName.set(name, [...(byName.get(name) ?? []), run])
    }
  }
  const attempts = new Map()
  for (const group of byName.values()) {
    if (group.length < 2) {
      continue
    }
    const ordered = [...group].sort(
      (left, right) => launchedAt(left) - launchedAt(right) || left.ref.localeCompare(right.ref)
    )
    ordered.forEach((run, index) => {
      const later = ordered.slice(index + 1).find((item) => item.state === 'succeeded')
      attempts.set(run.ref, {
        attempt: index + 1,
        of: ordered.length,
        succeededLater: later?.ref ?? null
      })
    })
  }
  return attempts
}
