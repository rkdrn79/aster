import { useEffect, useState } from 'react'
import { readProjectCatalog } from './research-project-catalog'
import { syncCatalogExperimentRecords } from './research-experiment-catalog-import'
import { syncCatalogRunRecords } from './research-catalog-run-import'
import type { selectResearchWorkspaceContext } from './research-workspace-context'
import { parseHostAuthorityKey } from '../../../../shared/host-authority'

export function useCatalogExperimentSync(
  context: ReturnType<typeof selectResearchWorkspaceContext>,
  ready: boolean
): string | null {
  const [issue, setIssue] = useState<{ owner: string; message: string } | null>(null)
  const owner = JSON.stringify([context.hostId, context.workspaceId, context.workspacePath])
  useEffect(() => {
    const { workspaceId, workspacePath, hostId } = context
    if (
      !ready ||
      !hostId ||
      !workspaceId ||
      !workspacePath ||
      parseHostAuthorityKey(hostId)?.at !== 'local'
    ) {
      return
    }
    let active = true
    let reading = false
    const sync = async (): Promise<void> => {
      if (reading) {
        return
      }
      reading = true
      try {
        const catalog = await readProjectCatalog({ workspaceId, workspacePath, hostId })
        await syncCatalogExperimentRecords(context, catalog)
        const issues = await syncCatalogRunRecords(context, catalog)
        if (active) {
          setIssue(
            issues.length
              ? {
                  owner,
                  message: `Some runs could not be added: ${issues.slice(0, 2).join('; ')}`
                }
              : null
          )
        }
      } catch {
        // A project without a catalog stays a normal workspace; manual import reports errors.
        if (active) {
          setIssue(null)
        }
      } finally {
        reading = false
      }
    }
    void sync()
    const interval = window.setInterval(() => void sync(), hostId === 'local' ? 10_000 : 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [context, owner, ready])
  return issue?.owner === owner ? issue.message : null
}
