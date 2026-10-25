import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import {
  dedupePaletteWorktrees,
  getPaletteWorktreeExecutionHostId
} from '@/lib/palette-repo-resolution'
import { getFolderWorkspaceWorktree } from '@/store/slices/worktrees/listing/detected-worktree-meta'
import { getWorktreeVisitTimestamp } from '@/lib/worktree-visit-recency'
import {
  buildProjectGroupingIndex,
  getProjectGroupingForRepo
} from '../../../../shared/project-section-grouping'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { ExecutionHostId } from '../../../../shared/execution-host'

export type ResearchHomeWorkspace = {
  id: string
  executionHostId: ExecutionHostId | undefined
  name: string
  path: string
  branch: string | null
  isMain: boolean
  isFolder: boolean
  repoId: string
  lastVisitedAt: number
}

export type ResearchHomeProject = {
  key: string
  name: string
  badgeColor: string | null
  /** The folder group a folder-workspace project renames and recolours through; null for repos. */
  projectGroupId: string | null
  /** The workspace a project opens into first: its most recent, else its main checkout. */
  workspaces: ResearchHomeWorkspace[]
  lastVisitedAt: number
}

type HomeProjectInputs = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'folderWorkspaces'
  | 'projects'
  | 'projectHostSetups'
  | 'projectGroups'
  | 'lastVisitedAtByWorktreeId'
>

function shortBranch(branch: string): string | null {
  const name = branch.replace(/^refs\/heads\//, '')
  return name.length > 0 ? name : null
}

function compareWorkspaces(a: ResearchHomeWorkspace, b: ResearchHomeWorkspace): number {
  return (
    b.lastVisitedAt - a.lastVisitedAt ||
    Number(b.isMain) - Number(a.isMain) ||
    a.name.localeCompare(b.name)
  )
}

/** Open workspaces grouped by the same project identity the classic sidebar uses. */
export function buildResearchHomeProjects(inputs: HomeProjectInputs): ResearchHomeProject[] {
  const repoMap = new Map(inputs.repos.map((repo) => [repo.id, repo]))
  const projectIndex = buildProjectGroupingIndex({
    projects: inputs.projects,
    projectHostSetups: inputs.projectHostSetups
  })
  const projects = new Map<string, ResearchHomeProject>()
  const worktrees = dedupePaletteWorktrees([
    ...Object.values(inputs.worktreesByRepo).flat(),
    ...inputs.folderWorkspaces.map(getFolderWorkspaceWorktree)
  ])
  for (const worktree of worktrees) {
    if (worktree.isArchived) {
      continue
    }
    const folderScope = parseWorkspaceKey(worktree.id)
    const isFolder = folderScope?.type === 'folder'
    const folderWorkspace = isFolder
      ? inputs.folderWorkspaces.find((entry) => entry.id === folderScope.folderWorkspaceId)
      : undefined
    const group = folderWorkspace
      ? inputs.projectGroups.find((entry) => entry.id === folderWorkspace.projectGroupId)
      : undefined
    const grouping = isFolder
      ? {
          key: `group:${folderWorkspace?.projectGroupId ?? worktree.repoId}`,
          label: group?.name ?? worktree.displayName
        }
      : getProjectGroupingForRepo(worktree.repoId, repoMap, projectIndex)
    const project =
      'projectId' in grouping && grouping.projectId
        ? inputs.projects.find((entry) => entry.id === grouping.projectId)
        : undefined
    const workspace: ResearchHomeWorkspace = {
      id: worktree.id,
      executionHostId: getPaletteWorktreeExecutionHostId(worktree),
      name: worktree.displayName || worktree.path,
      path: worktree.path,
      branch: isFolder ? null : shortBranch(worktree.branch),
      isMain: worktree.isMainWorktree,
      isFolder,
      repoId: worktree.repoId,
      lastVisitedAt: getWorktreeVisitTimestamp(inputs.lastVisitedAtByWorktreeId, worktree) ?? 0
    }
    const existing = projects.get(grouping.key)
    if (existing) {
      existing.workspaces.push(workspace)
      existing.lastVisitedAt = Math.max(existing.lastVisitedAt, workspace.lastVisitedAt)
      continue
    }
    projects.set(grouping.key, {
      key: grouping.key,
      name: grouping.label,
      badgeColor:
        project?.badgeColor ?? repoMap.get(worktree.repoId)?.badgeColor ?? group?.color ?? null,
      projectGroupId: isFolder ? (folderWorkspace?.projectGroupId ?? null) : null,
      workspaces: [workspace],
      lastVisitedAt: workspace.lastVisitedAt
    })
  }
  const result = [...projects.values()]
  for (const project of result) {
    project.workspaces.sort(compareWorkspaces)
  }
  return result.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt || a.name.localeCompare(b.name))
}

export function useResearchHomeProjects(): ResearchHomeProject[] {
  const inputs = useAppStore(
    useShallow((state) => ({
      repos: state.repos,
      worktreesByRepo: state.worktreesByRepo,
      folderWorkspaces: state.folderWorkspaces,
      projects: state.projects,
      projectHostSetups: state.projectHostSetups,
      projectGroups: state.projectGroups,
      lastVisitedAtByWorktreeId: state.lastVisitedAtByWorktreeId
    }))
  )
  return useMemo(() => buildResearchHomeProjects(inputs), [inputs])
}

export function useResearchActiveProject(): {
  project: ResearchHomeProject | null
  workspace: ResearchHomeWorkspace | null
} {
  const projects = useResearchHomeProjects()
  const workspaceId = useAppStore((state) => state.activeWorktreeId)
  for (const project of projects) {
    const workspace = project.workspaces.find((entry) => entry.id === workspaceId)
    if (workspace) {
      return { project, workspace }
    }
  }
  return { project: null, workspace: null }
}
