import { useEffect, useState } from 'react'
import type { RebuttalRegroup } from '../../../../research-harness/research-rebuttal-regroup.mjs'
import { rebuttalDirtySlots } from './research-rebuttal-editing'
import type { RebuttalOwner } from './research-rebuttal-files'
import { holdRebuttalRegroup } from './research-rebuttal-regroup-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

type Shown = Pick<RebuttalSnapshot, 'regroups'>

/** A regroup that is applied in `next` but was not in what the page shows. */
function newlyApplied(
  next: Shown,
  shown: Shown | null,
  passed: ReadonlySet<string>
): RebuttalRegroup | null {
  return (
    next.regroups.find(
      (record) =>
        record.applied &&
        !passed.has(record.id) &&
        !shown?.regroups.some((entry) => entry.id === record.id && entry.applied)
    ) ?? null
  )
}

/**
 * The snapshot the page shows. When a regroup lands in a reply that holds unsaved typing, the
 * page keeps showing the groups as they were, puts them back on disk and keeps the regroup
 * waiting, so text being typed is never moved or unmounted mid-word.
 */
export function useRebuttalShownSnapshot<T extends Shown>(
  owner: RebuttalOwner,
  snapshot: T | null
): T | null {
  const [shown, setShown] = useState(snapshot)
  const [holding, setHolding] = useState<string | null>(null)
  const [passed, setPassed] = useState<ReadonlySet<string>>(() => new Set())
  // Why during render: showing the regrouped page for even one frame would unmount the field.
  if (snapshot !== shown) {
    const landed = snapshot ? newlyApplied(snapshot, shown, passed) : null
    const typing = rebuttalDirtySlots()
    if (landed && landed.affected.some((slot) => typing.has(slot))) {
      if (holding !== landed.id) {
        setHolding(landed.id)
      }
    } else {
      setShown(snapshot)
    }
  }
  useEffect(() => {
    if (!holding) {
      return
    }
    void holdRebuttalRegroup(owner, holding)
      .catch(() => undefined)
      .finally(() => {
        setPassed((current) => new Set([...current, holding]))
        setHolding(null)
      })
  }, [owner, holding])
  return shown
}
