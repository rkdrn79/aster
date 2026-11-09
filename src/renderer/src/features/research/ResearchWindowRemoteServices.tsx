import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useHostModelCatalogSnapshotsSync } from '@/runtime/host-model-catalog-snapshots-sync'
import { useHostStructuredAgentsSync } from '@/runtime/host-structured-agents-sync'
import { useAppStore } from '@/store'
import { useResearchRecords } from './research-records-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { useCatalogExperimentSync } from './use-catalog-experiment-sync'

/**
 * The host reads a project window on a remote host needs of its own. The window is a second
 * renderer, so its per-renderer caches start empty and the main window's reads never fill them.
 * Only remote projects mount this: a local project's window keeps reading exactly what it did.
 */
export function ResearchWindowRemoteServices(): null {
  useHostStructuredAgentsSync()
  useHostModelCatalogSnapshotsSync()
  // Why: the sidebar that runs this in the main window never mounts here, so a project opened
  // straight into its own window would show no Experiments from the host's catalog.
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const recordsLoaded = useResearchRecords((state) => state.document !== null)
  useEffect(() => {
    void useResearchRecords.getState().load()
  }, [])
  useCatalogExperimentSync(context, recordsLoaded)
  return null
}
