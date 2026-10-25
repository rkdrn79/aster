import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { Project } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import type { ResearchComputeLink } from '../../../../shared/research/research-compute-links'

export function localRootsForComputeLink(
  link: ResearchComputeLink | null,
  repos: readonly Repo[],
  projects: readonly Project[]
): string[] {
  const sourceRepoIds = projects.find((project) => project.id === link?.projectId)?.sourceRepoIds
  if (!sourceRepoIds) {
    return []
  }
  return repos
    .filter(
      (repo) =>
        getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID && sourceRepoIds.includes(repo.id)
    )
    .map((repo) => repo.path)
}
