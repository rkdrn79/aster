// Why per device: which SSH hosts this computer reads is a local preference.
const STORAGE_KEY = 'aster.research.compute.selectedHosts'

/** The hosts the user chose to show, or null before they have chosen any. */
export function readComputeSelectedHosts(): Set<string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : null
  } catch {
    return null
  }
}

export function writeComputeSelectedHosts(targetIds: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...targetIds]))
  } catch {
    // Storage can be full or disabled; the choice then lasts for this session only.
  }
}
