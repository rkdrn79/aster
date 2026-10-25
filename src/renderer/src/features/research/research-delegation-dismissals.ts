import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'aster.research-dismissed-delegations.v1'
const MAX_ENTRIES = 500

type Dismissals = Readonly<Record<string, number>>

function read(): Dismissals {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    )
  } catch {
    return {}
  }
}

// Why module state: the sidebar list and the Background tasks dialog show the same dismissals.
let dismissals: Dismissals | null = null
const listeners = new Set<() => void>()

function snapshot(): Dismissals {
  dismissals ??= read()
  return dismissals
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** When each background task was dismissed on this device; newer activity shows it again. */
export function useResearchDelegationDismissals(): Dismissals {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function dismissResearchDelegations(ids: readonly string[], now = Date.now()): void {
  if (ids.length === 0) {
    return
  }
  const next = Object.entries({
    ...snapshot(),
    ...Object.fromEntries(ids.map((id) => [id, now]))
  })
    .sort((left, right) => left[1] - right[1])
    .slice(-MAX_ENTRIES)
  dismissals = Object.fromEntries(next)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissals))
  } catch {
    // Why: a full storage only means the task shows again next session.
  }
  for (const listener of listeners) {
    listener()
  }
}
