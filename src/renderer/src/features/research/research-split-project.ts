import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { findResearchActiveProject, useResearchHomeProjects } from './research-home-projects'

export type ResearchSplitProjectLabel = { name: string; badgeColor: string | null }

/** How a column names the project it shows: the project, else its workspace, else "Projects". */
export function useResearchSplitProjectLabel(
  workspaceId: string | null,
  hostId: string | null
): ResearchSplitProjectLabel {
  const projects = useResearchHomeProjects()
  if (!workspaceId) {
    return { name: 'Projects', badgeColor: null }
  }
  const { project, workspace } = findResearchActiveProject(
    projects,
    workspaceId,
    normalizeExecutionHostId(hostId)
  )
  return {
    name: project?.name ?? workspace?.name ?? 'Project',
    badgeColor: project?.badgeColor ?? null
  }
}
