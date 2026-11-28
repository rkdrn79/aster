import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { ServerAutoUpdateHostStatus } from '../../../../shared/server-auto-update'

export type ServerAutoUpdateSlice = {
  /** Each managed SSH server's automatic-update state, keyed by its runtime environment id. */
  serverAutoUpdateStatuses: Record<string, ServerAutoUpdateHostStatus>
  /** Replaces the whole set: the desktop always reports every host, so a missing one is gone. */
  setServerAutoUpdateStatuses: (statuses: readonly ServerAutoUpdateHostStatus[]) => void
}

export function indexServerAutoUpdateStatuses(
  statuses: readonly ServerAutoUpdateHostStatus[]
): Record<string, ServerAutoUpdateHostStatus> {
  return Object.fromEntries(statuses.map((status) => [status.environmentId, status]))
}

function sameStatuses(
  a: Record<string, ServerAutoUpdateHostStatus>,
  b: Record<string, ServerAutoUpdateHostStatus>
): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) {
    return false
  }
  return aKeys.every((key) => key in b && JSON.stringify(a[key]) === JSON.stringify(b[key]))
}

export const createServerAutoUpdateSlice: StateCreator<AppState, [], [], ServerAutoUpdateSlice> = (
  set
) => ({
  serverAutoUpdateStatuses: {},
  setServerAutoUpdateStatuses: (statuses) =>
    set((state) => {
      const next = indexServerAutoUpdateStatuses(statuses)
      // Why: the desktop re-broadcasts the full list on every change; an identical one repaints nothing.
      return sameStatuses(state.serverAutoUpdateStatuses, next)
        ? state
        : { serverAutoUpdateStatuses: next }
    })
})
