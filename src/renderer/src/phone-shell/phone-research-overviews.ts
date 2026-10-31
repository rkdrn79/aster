import { useEffect } from 'react'
import { create } from 'zustand'
import { readResearchProjectOnHost } from '@/features/research/research-project-host-reads'
import type { ResearchProjectReadResult } from '../../../shared/research/research-project-api'

const STALE_AFTER_MS = 15_000

export type PhoneResearchOverview =
  | { status: 'loading' }
  | { status: 'ready'; result: ResearchProjectReadResult; readAt: number }
  | { status: 'error'; message: string; readAt: number }

/** `researchProject.read` results per workspace, shared by Home, a project, and Runs. */
export const usePhoneResearchOverviews = create<{
  byWorktreeId: Readonly<Record<string, PhoneResearchOverview>>
}>(() => ({ byWorktreeId: {} }))

const inFlight = new Map<string, Promise<void>>()

function setOverview(worktreeId: string, overview: PhoneResearchOverview): void {
  usePhoneResearchOverviews.setState((state) => ({
    byWorktreeId: { ...state.byWorktreeId, [worktreeId]: overview }
  }))
}

export function refreshPhoneResearchOverview(worktreeId: string, force = false): Promise<void> {
  const current = usePhoneResearchOverviews.getState().byWorktreeId[worktreeId]
  if (
    !force &&
    current &&
    current.status !== 'loading' &&
    Date.now() - current.readAt < STALE_AFTER_MS
  ) {
    return Promise.resolve()
  }
  const pending = inFlight.get(worktreeId)
  if (pending) {
    return pending
  }
  if (!current || current.status === 'error') {
    setOverview(worktreeId, { status: 'loading' })
  }
  // Why local: in the web client the local target is the paired host that owns the workspace.
  const read = readResearchProjectOnHost({ kind: 'local' }, worktreeId)
    .then((result) => setOverview(worktreeId, { status: 'ready', result, readAt: Date.now() }))
    .catch((error: unknown) =>
      setOverview(worktreeId, {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        readAt: Date.now()
      })
    )
    .finally(() => inFlight.delete(worktreeId))
  inFlight.set(worktreeId, read)
  return read
}

/** Re-reads every overview already shown, for an explicit refresh. */
export function refreshAllPhoneResearchOverviews(): void {
  for (const worktreeId of Object.keys(usePhoneResearchOverviews.getState().byWorktreeId)) {
    void refreshPhoneResearchOverview(worktreeId, true)
  }
}

/** Reads each workspace's research overview once it is stale; there is no background polling. */
export function usePhoneResearchOverviewRefresh(worktreeIds: readonly string[]): void {
  const key = worktreeIds.join('\0')
  useEffect(() => {
    for (const worktreeId of key ? key.split('\0') : []) {
      void refreshPhoneResearchOverview(worktreeId)
    }
  }, [key])
}
