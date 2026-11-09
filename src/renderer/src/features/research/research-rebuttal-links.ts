import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type {
  ExperimentRecord,
  ResearchDocument
} from '../../../../shared/research/research-records'
import type { RebuttalCluster } from '../../../../research-harness/research-rebuttal-model.mjs'
import { createCatalogExperiment } from './research-experiment-catalog-import'
import { openResearchExperimentPage } from './research-experiment-page'
import { selectResearchExperimentRecord } from './research-experiment-select'
import { openResearchView } from './research-navigation'
import { useResearchRecords } from './research-records-store'
import { rebuttalAbsolutePath, type RebuttalOwner } from './research-rebuttal-files'
import type { selectResearchWorkspaceContext } from './research-workspace-context'

type WorkspaceContext = ReturnType<typeof selectResearchWorkspaceContext>

/** The Experiment a cluster names by catalog slug (or, off the catalog, by record ID or name). */
export function clusterExperiment(
  records: ResearchDocument | null,
  owner: RebuttalOwner,
  cluster: Pick<RebuttalCluster, 'experiment'>
): ExperimentRecord | null {
  const wanted = cluster.experiment
  if (!wanted || !records) {
    return null
  }
  const inProject = records.experiments.filter(
    (entry) => entry.hostId === owner.hostId && entry.workspaceId === owner.workspaceId
  )
  return (
    inProject.find((entry) => entry.catalogSlug === wanted) ??
    inProject.find((entry) => entry.id === wanted) ??
    inProject.find((entry) => entry.name === wanted) ??
    null
  )
}

/**
 * Creates the Experiment that answers a cluster the way the Experiments list does: a catalog
 * folder in a local project, an Aster record elsewhere. Resolves to the value `experiment` keeps.
 */
export async function createClusterExperiment(
  context: WorkspaceContext,
  cluster: Pick<RebuttalCluster, 'id' | 'title'>
): Promise<string> {
  const name = `Rebuttal ${cluster.id}: ${cluster.title}`.slice(0, 64).trim()
  if (context.hostId === 'local') {
    return createCatalogExperiment(context, name)
  }
  const { workspaceId, workspacePath, hostId } = context
  if (!workspaceId || !workspacePath || !hostId) {
    throw new Error('Open the project first.')
  }
  const now = new Date().toISOString()
  const experiment = {
    id: createBrowserUuid(),
    name,
    projectId: context.projectId,
    workspaceId,
    workspacePath,
    hostId,
    archived: false,
    createdAt: now,
    updatedAt: now
  }
  await useResearchRecords.getState().update((current) => ({
    ...current,
    experiments: [...current.experiments, experiment]
  }))
  return experiment.id
}

export async function openClusterExperiment(experiment: ExperimentRecord): Promise<void> {
  await selectResearchExperimentRecord(experiment.id)
  openResearchExperimentPage(experiment.id, 'notebook')
}

/** Opens Writing and puts the cursor on the cluster's line once its source is on screen. */
export function openClusterInWriting(
  owner: RebuttalOwner,
  location: NonNullable<RebuttalCluster['manuscript']>
): void {
  useAppStore.getState().setPendingEditorReveal({
    filePath: rebuttalAbsolutePath(owner, location.file),
    line: location.line ?? 1,
    column: 1,
    matchLength: 0
  })
  openResearchView('research-writing')
}
