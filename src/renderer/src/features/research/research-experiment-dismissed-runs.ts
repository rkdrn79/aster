import { useCallback, useMemo, useState } from 'react'

const STORAGE_PREFIX = 'aster.research-dismissed-failed-runs.v1:'
const MAX_KEYS = 500
const NO_KEYS: readonly string[] = []

/** `run:<id>` keys dismissed for one Experiment, read straight from this device's storage. */
export function readKeys(scope: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${scope}`) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : NO_KEYS
  } catch {
    return NO_KEYS
  }
}

/** Failed Runs the user dismissed from Needs you, kept per Experiment on this device. */
export function useDismissedRuns(scope: string | null): {
  dismissed: ReadonlySet<string>
  dismiss: (key: string) => void
} {
  const [saved, setSaved] = useState<{ scope: string; keys: readonly string[] } | null>(null)
  const stored = useMemo(() => (scope ? readKeys(scope) : NO_KEYS), [scope])
  const keys = saved && saved.scope === scope ? saved.keys : stored
  const dismissed = useMemo(() => new Set(keys), [keys])
  const dismiss = useCallback(
    (key: string) => {
      if (!scope) {
        return
      }
      const next = [...new Set([...readKeys(scope), key])].slice(-MAX_KEYS)
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${scope}`, JSON.stringify(next))
      } catch {
        // Why: a full storage only means the note returns next session.
      }
      setSaved({ scope, keys: next })
    },
    [scope]
  )
  return { dismissed, dismiss }
}
