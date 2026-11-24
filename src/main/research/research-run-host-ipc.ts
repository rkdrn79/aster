import type { ResearchRunHostQuery } from '../../shared/research/research-run-host'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { authorizedProjectPath } from './research-harness-ipc'
import { runManifestParts } from './research-run-host-paths'

/**
 * Only run.json files inside a research record tree are read; on this computer their project must
 * be one the user opened, and a remote read needs a registered SSH host.
 */
export async function authorizedResearchRunHostQuery(
  query: ResearchRunHostQuery
): Promise<ResearchRunHostQuery> {
  const parts = query.runs.map((run) => runManifestParts(run.manifestPath))
  if (parts.some((part) => part === null)) {
    throw new Error('Only run.json files inside a research record tree can be read.')
  }
  if (query.targetId !== null) {
    if (!listRegisteredSshTargets().some((target) => target.id === query.targetId)) {
      throw new Error('This SSH host is not registered in Aster.')
    }
    return query
  }
  const projects = new Set(parts.flatMap((part) => (part ? [part.projectPath] : [])))
  await Promise.all([...projects].map((project) => authorizedProjectPath(project)))
  return query
}
