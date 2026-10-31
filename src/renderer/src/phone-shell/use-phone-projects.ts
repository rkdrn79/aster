import { useMemo } from 'react'
import {
  useResearchHomeProjects,
  type ResearchHomeProject,
  type ResearchHomeWorkspace
} from '@/features/research/research-home-projects'

export type PhoneWorkspaceEntry = {
  project: ResearchHomeProject
  workspace: ResearchHomeWorkspace
}

/** Projects as Home groups them, plus a lookup from workspace id to its project. */
export function usePhoneProjects(): {
  projects: ResearchHomeProject[]
  byWorkspaceId: ReadonlyMap<string, PhoneWorkspaceEntry>
} {
  const projects = useResearchHomeProjects()
  const byWorkspaceId = useMemo(() => {
    const index = new Map<string, PhoneWorkspaceEntry>()
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        index.set(workspace.id, { project, workspace })
      }
    }
    return index
  }, [projects])
  return { projects, byWorkspaceId }
}

/** "project · workspace", or just the project when it has a single checkout. */
export function phoneWorkspaceLabel(entry: PhoneWorkspaceEntry | undefined): string {
  if (!entry) {
    return 'Workspace'
  }
  return entry.project.workspaces.length > 1
    ? `${entry.project.name} · ${entry.workspace.name}`
    : entry.project.name
}
