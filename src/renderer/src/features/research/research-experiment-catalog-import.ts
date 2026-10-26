import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { selectResearchExperiment } from '../../../../shared/research/research-selection'
import { useResearchRecords } from './research-records-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { readProjectCatalog, type ProjectCatalog } from './research-project-catalog'
import { readCatalogManuscript } from './research-writing-project'

export async function importCatalogExperimentRecord(
  context: ReturnType<typeof selectResearchWorkspaceContext>,
  catalog: ProjectCatalog,
  entry: ProjectCatalog['experiments'][number]
): Promise<void> {
  const { workspaceId, workspacePath, hostId, projectId } = context
  if (!workspaceId || !workspacePath || !hostId) {
    throw new Error('Select a workspace before importing an Experiment.')
  }
  const workspaceIdentity = JSON.stringify([hostId, workspaceId, workspacePath])
  const selectionKey = JSON.stringify([hostId, workspaceId])
  const manuscript = catalog.manuscript
  const now = new Date().toISOString()
  await useResearchRecords.getState().update((current) => {
    const latest = selectResearchWorkspaceContext(useAppStore.getState())
    if (
      JSON.stringify([latest.hostId, latest.workspaceId, latest.workspacePath]) !==
      workspaceIdentity
    ) {
      throw new Error('The active workspace changed during import.')
    }
    const existing = current.experiments.find(
      (experiment) =>
        experiment.hostId === hostId &&
        experiment.workspaceId === workspaceId &&
        experiment.catalogSlug === entry.slug
    )
    if (existing) {
      return selectResearchExperiment(
        {
          ...current,
          selectedExperimentByWorkspace: {
            ...current.selectedExperimentByWorkspace,
            [selectionKey]: existing.id
          }
        },
        existing.id
      )
    }
    const experiment = {
      id: createBrowserUuid(),
      name: entry.name,
      projectId,
      workspaceId,
      workspacePath,
      hostId,
      catalogSlug: entry.slug,
      manuscript: { sourcePath: manuscript.source, pdfPath: manuscript.pdf },
      archived: false,
      createdAt: now,
      updatedAt: now
    }
    return {
      ...current,
      experiments: [...current.experiments, experiment],
      selectedExperimentByWorkspace: {
        ...current.selectedExperimentByWorkspace,
        [selectionKey]: experiment.id
      },
      selectedExperimentId: experiment.id,
      selectedRunId: null
    }
  })
}

/** Creates the Experiment folder in a local project (`.aster/experiments/<slug>`), links and selects it; returns the slug. */
export async function createCatalogExperiment(
  context: ReturnType<typeof selectResearchWorkspaceContext>,
  name: string
): Promise<string> {
  const { workspaceId, workspacePath, hostId } = context
  if (!workspaceId || !workspacePath || hostId !== 'local') {
    throw new Error('Experiments in the project folder need a local workspace.')
  }
  let hasCatalog = true
  try {
    await readProjectCatalog({ workspaceId, workspacePath, hostId })
  } catch {
    hasCatalog = false
  }
  if (!hasCatalog) {
    const manuscript = await readCatalogManuscript({
      hostId,
      workspaceId,
      workspacePath,
      projectId: context.projectId,
      name: context.projectName ?? context.workspaceName ?? 'Project'
    })
    if (manuscript) {
      await window.api.researchProjectLayout.initialize({
        workspacePath,
        manuscript: manuscript.sourcePath,
        createPaper: false
      })
    }
  }
  const result = await window.api.researchProjectLayout.createExperiment({ workspacePath, name })
  const catalog = await readProjectCatalog({ workspaceId, workspacePath, hostId })
  const entry = catalog.experiments.find((candidate) => candidate.slug === result.slug)
  if (!entry) {
    throw new Error('The new experiment was not found in the project.')
  }
  await importCatalogExperimentRecord(context, catalog, entry)
  return result.slug
}

export async function syncCatalogExperimentRecords(
  context: ReturnType<typeof selectResearchWorkspaceContext>,
  catalog: ProjectCatalog
): Promise<void> {
  const { workspaceId, workspacePath, hostId, projectId } = context
  if (!workspaceId || !workspacePath || !hostId) {
    return
  }
  const snapshot = useResearchRecords.getState().document
  if (
    !snapshot ||
    catalog.experiments.every((entry) =>
      snapshot.experiments.some(
        (experiment) =>
          experiment.hostId === hostId &&
          experiment.workspaceId === workspaceId &&
          experiment.catalogSlug === entry.slug
      )
    )
  ) {
    return
  }
  const workspaceIdentity = JSON.stringify([hostId, workspaceId, workspacePath])
  await useResearchRecords.getState().update((current) => {
    const latest = selectResearchWorkspaceContext(useAppStore.getState())
    if (
      JSON.stringify([latest.hostId, latest.workspaceId, latest.workspacePath]) !==
      workspaceIdentity
    ) {
      return current
    }
    const existingSlugs = new Set(
      current.experiments
        .filter(
          (experiment) => experiment.hostId === hostId && experiment.workspaceId === workspaceId
        )
        .map((experiment) => experiment.catalogSlug)
    )
    const missing = catalog.experiments.filter((entry) => {
      if (existingSlugs.has(entry.slug)) {
        return false
      }
      existingSlugs.add(entry.slug)
      return true
    })
    if (!missing.length) {
      return current
    }
    const now = new Date().toISOString()
    const added = missing.map((entry) => ({
      id: createBrowserUuid(),
      name: entry.name,
      projectId,
      workspaceId,
      workspacePath,
      hostId,
      catalogSlug: entry.slug,
      manuscript: {
        sourcePath: catalog.manuscript.source,
        pdfPath: catalog.manuscript.pdf
      },
      archived: false,
      createdAt: now,
      updatedAt: now
    }))
    const next = { ...current, experiments: [...current.experiments, ...added] }
    const hasSelection = current.experiments.some(
      (experiment) =>
        experiment.id === current.selectedExperimentId &&
        experiment.hostId === hostId &&
        experiment.workspaceId === workspaceId
    )
    if (hasSelection) {
      return next
    }
    // Why: sync never replaces a selection, but a workspace with none opens on the new experiment.
    return selectResearchExperiment(
      {
        ...next,
        selectedExperimentByWorkspace: {
          ...next.selectedExperimentByWorkspace,
          [JSON.stringify([hostId, workspaceId])]: added[0].id
        }
      },
      added[0].id
    )
  })
}
