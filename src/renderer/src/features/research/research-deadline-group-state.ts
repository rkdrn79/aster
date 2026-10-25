import { useState } from 'react'

// Why per device: which conference groups are open is a local reading preference.
const STORAGE_KEY = 'aster.research.deadlines.openGroups'
const DEFAULT_OPEN = ['tracked']

function readOpenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === 'string')
        : DEFAULT_OPEN
    )
  } catch {
    return new Set(DEFAULT_OPEN)
  }
}

function writeOpenGroups(keys: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // Storage can be full or disabled; the choice then lasts for this session only.
  }
}

function toggled(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  return next
}

/**
 * Folder-like open state for conference groups. While a search or topic filter narrows the
 * list, every matching group opens so results are visible, and closing one lasts only for that
 * search.
 */
export function useConferenceGroupOpenState(filterKey: string | null): {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
} {
  const [open, setOpen] = useState(readOpenGroups)
  const [closedWhileFiltering, setClosedWhileFiltering] = useState<{
    filterKey: string
    keys: Set<string>
  } | null>(null)
  const closed =
    filterKey !== null && closedWhileFiltering?.filterKey === filterKey
      ? closedWhileFiltering.keys
      : new Set<string>()

  return {
    isOpen: (key) => (filterKey === null ? open.has(key) : !closed.has(key)),
    toggle: (key) => {
      if (filterKey !== null) {
        setClosedWhileFiltering({ filterKey, keys: toggled(closed, key) })
        return
      }
      const next = toggled(open, key)
      setOpen(next)
      writeOpenGroups(next)
    }
  }
}
