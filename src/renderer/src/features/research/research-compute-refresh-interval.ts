// Why per device: how often this computer polls the cluster is a local preference.
const STORAGE_KEY = 'aster.research.compute.refreshIntervalMs'

// Why 30s default: squeue/sinfo hit the cluster controller, which shared clusters ask users not to poll hard.
export const DEFAULT_COMPUTE_REFRESH_INTERVAL_MS = 30_000

/** 0 means auto-refresh is off; the Refresh button still reads on demand. */
export const COMPUTE_REFRESH_INTERVAL_OPTIONS: readonly { ms: number; label: string }[] = [
  { ms: 0, label: 'Auto-refresh off' },
  { ms: 15_000, label: 'Every 15 seconds' },
  { ms: 30_000, label: 'Every 30 seconds' },
  { ms: 60_000, label: 'Every minute' },
  { ms: 120_000, label: 'Every 2 minutes' },
  { ms: 300_000, label: 'Every 5 minutes' },
  { ms: 600_000, label: 'Every 10 minutes' }
]

function isOfferedInterval(ms: number): boolean {
  return COMPUTE_REFRESH_INTERVAL_OPTIONS.some((option) => option.ms === ms)
}

export function readComputeRefreshInterval(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw === null ? Number.NaN : Number(raw)
    return isOfferedInterval(parsed) ? parsed : DEFAULT_COMPUTE_REFRESH_INTERVAL_MS
  } catch {
    return DEFAULT_COMPUTE_REFRESH_INTERVAL_MS
  }
}

export function writeComputeRefreshInterval(ms: number): void {
  if (!isOfferedInterval(ms)) {
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(ms))
  } catch {
    // Storage can be full or disabled; the choice then lasts for this session only.
  }
}
