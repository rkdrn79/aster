import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { researchErrorText } from '@/features/research/research-error-text'
import type { ProjectFileOwner } from '@/features/research/research-project-files'
import { readPhoneFigures, type PhoneFigureProject } from './phone-figures'
import { usePhoneResearchOverviews } from './phone-research-overviews'
import { usePhoneProjects } from './use-phone-projects'

export type PhoneFiguresRead =
  | { status: 'loading' }
  | { status: 'ready'; project: PhoneFigureProject }
  | { status: 'error'; message: string }

/** Figure lists per workspace, shared by the list and the figure it opens. */
export const usePhoneFigureLists = create<{ byWorktreeId: Record<string, PhoneFiguresRead> }>(
  () => ({ byWorktreeId: {} })
)

function setRead(worktreeId: string, read: PhoneFiguresRead): void {
  usePhoneFigureLists.setState((state) => ({
    byWorktreeId: { ...state.byWorktreeId, [worktreeId]: read }
  }))
}

/** The workspace as a project-file owner on the paired host, or null before the host lists it. */
export function usePhoneProjectOwner(worktreeId: string): ProjectFileOwner | null {
  const { byWorkspaceId } = usePhoneProjects()
  const path = byWorkspaceId.get(worktreeId)?.workspace.path
  // Why local: in the web client the local target is the paired host that owns the workspace.
  return useMemo(
    () => (path ? { hostId: 'local', workspaceId: worktreeId, workspacePath: path } : null),
    [worktreeId, path]
  )
}

/** The manuscript the catalog names, so figures beside it are found; null for the default. */
export function usePhoneManuscriptSource(worktreeId: string): string | null {
  return usePhoneResearchOverviews((state) => {
    const overview = state.byWorktreeId[worktreeId]
    return overview?.status === 'ready' && overview.result.catalog.status === 'present'
      ? (overview.result.catalog.value.manuscript?.source ?? null)
      : null
  })
}

/** Reads the workspace's figures on open, and again when `generation` changes. */
export function usePhoneFigures(worktreeId: string, generation = 0): PhoneFiguresRead {
  const owner = usePhoneProjectOwner(worktreeId)
  const manuscript = usePhoneManuscriptSource(worktreeId)
  const path = owner?.workspacePath ?? null
  useEffect(() => {
    if (!path) {
      return
    }
    let active = true
    if (!usePhoneFigureLists.getState().byWorktreeId[worktreeId]) {
      setRead(worktreeId, { status: 'loading' })
    }
    readPhoneFigures(
      { hostId: 'local', workspaceId: worktreeId, workspacePath: path },
      manuscript
    ).then(
      (project) => active && setRead(worktreeId, { status: 'ready', project }),
      (error: unknown) =>
        active && setRead(worktreeId, { status: 'error', message: researchErrorText(error) })
    )
    return () => {
      active = false
    }
  }, [worktreeId, path, manuscript, generation])
  return usePhoneFigureLists((state) => state.byWorktreeId[worktreeId]) ?? { status: 'loading' }
}
