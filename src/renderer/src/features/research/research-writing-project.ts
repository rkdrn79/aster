import type {
  ExperimentRecord,
  ResearchDocument
} from '../../../../shared/research/research-records'
import { relativePathInsideRoot } from '../../../../shared/cross-platform-path'
import { useResearchRecords } from './research-records-store'
import { readProjectCatalog } from './research-project-catalog'
import { resolveManuscriptFile } from './research-writing-source'

export type WritingProjectScope = Pick<
  ExperimentRecord,
  'hostId' | 'workspaceId' | 'workspacePath' | 'projectId'
> & { name: string }

type ScopeKey = { hostId?: string | null; workspaceId: string | null | undefined }

function inScope(experiment: ExperimentRecord, scope: ScopeKey): boolean {
  return (
    !experiment.archived &&
    experiment.workspaceId === scope.workspaceId &&
    (scope.hostId === undefined || experiment.hostId === scope.hostId)
  )
}

/**
 * The Experiment record that carries the project's manuscript and Writing chat: the earliest one
 * with a manuscript, else the earliest. Selection never changes it, so Writing stays project-wide.
 */
export function writingOwnerExperiment(
  experiments: readonly ExperimentRecord[],
  scope: ScopeKey
): ExperimentRecord | null {
  const project = experiments
    .filter((experiment) => inScope(experiment, scope))
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
  return project.find((experiment) => experiment.manuscript) ?? project[0] ?? null
}

export function selectWritingOwner(
  document: ResearchDocument | null,
  scope: ScopeKey
): ExperimentRecord | null {
  return document ? writingOwnerExperiment(document.experiments, scope) : null
}

/** Writing's stand-in record for a project with no Experiment yet; its manuscript is the catalog's. */
export function projectWritingRecord(
  scope: WritingProjectScope,
  manuscript: ExperimentRecord['manuscript']
): ExperimentRecord {
  return {
    id: `project:${scope.hostId}:${scope.workspaceId}`,
    name: scope.name,
    projectId: scope.projectId,
    workspaceId: scope.workspaceId,
    workspacePath: scope.workspacePath,
    hostId: scope.hostId,
    manuscript,
    archived: false,
    createdAt: '',
    updatedAt: ''
  }
}

async function saveRecordsManuscript(
  scope: WritingProjectScope,
  manuscript: NonNullable<ExperimentRecord['manuscript']>
): Promise<void> {
  const document = useResearchRecords.getState().document
  if (!document?.experiments.some((experiment) => inScope(experiment, scope))) {
    return
  }
  const now = new Date().toISOString()
  // Why every Experiment: handoffs and claims read the manuscript from whichever one is selected.
  await useResearchRecords.getState().update((current) => ({
    ...current,
    experiments: current.experiments.map((entry) =>
      inScope(entry, scope)
        ? {
            ...entry,
            manuscript: {
              sourcePath: manuscript.sourcePath,
              pdfPath:
                entry.manuscript?.sourcePath === manuscript.sourcePath
                  ? (entry.manuscript.pdfPath ?? manuscript.pdfPath)
                  : manuscript.pdfPath
            },
            updatedAt: now
          }
        : entry
    )
  }))
}

async function hasProjectCatalog(scope: WritingProjectScope): Promise<boolean> {
  return readProjectCatalog(scope).then(
    () => true,
    () => false
  )
}

/**
 * Makes `sourcePath` the project's main .tex: on its Experiments and, in a local project, in the
 * catalog the harness reads (created when the project has no Experiment to hold the choice).
 */
export async function saveProjectManuscript(
  scope: WritingProjectScope,
  sourcePath: string,
  hasExperiments: boolean
): Promise<string> {
  const file = resolveManuscriptFile(scope, sourcePath, '.tex')
  const initialize = window.api.researchProjectLayout?.initialize
  if (
    scope.hostId === 'local' &&
    initialize &&
    (!hasExperiments || (await hasProjectCatalog(scope)))
  ) {
    await initialize({
      workspacePath: scope.workspacePath,
      manuscript: file.relativePath.replaceAll('\\', '/'),
      createPaper: false
    })
  }
  await saveRecordsManuscript(scope, { sourcePath: file.relativePath, pdfPath: null })
  return file.relativePath
}

/** Writes the template manuscript where the project catalog points (`paper/main.tex` by default). */
export async function createProjectManuscript(scope: WritingProjectScope): Promise<string> {
  if (scope.hostId !== 'local' || !window.api.researchProjectLayout?.initialize) {
    throw new Error('Creating a manuscript needs a local project.')
  }
  const result = await window.api.researchProjectLayout.initialize({
    workspacePath: scope.workspacePath
  })
  const relative = relativePathInsideRoot(scope.workspacePath, result.manuscriptSource)
  if (!relative) {
    throw new Error('The new manuscript is outside the project folder.')
  }
  await saveRecordsManuscript(scope, { sourcePath: relative, pdfPath: null })
  return relative
}

/** The catalog's manuscript of a local project, or undefined when the project has no catalog. */
export async function readCatalogManuscript(
  scope: WritingProjectScope
): Promise<ExperimentRecord['manuscript']> {
  try {
    const catalog = await readProjectCatalog(scope)
    return { sourcePath: catalog.manuscript.source, pdfPath: catalog.manuscript.pdf }
  } catch {
    return undefined
  }
}

const PROJECT_PDF_PREFIX = 'aster.research-writing-project-pdf.v1:'

/** A project without Experiments has no record for its last build, so the PDF path stays here. */
export function readProjectPdfPath(recordId: string, sourcePath: string): string | null {
  try {
    return localStorage.getItem(`${PROJECT_PDF_PREFIX}${recordId}:${sourcePath}`)
  } catch {
    return null
  }
}

export function saveProjectPdfPath(recordId: string, sourcePath: string, pdfPath: string): void {
  try {
    localStorage.setItem(`${PROJECT_PDF_PREFIX}${recordId}:${sourcePath}`, pdfPath)
  } catch {
    // Storage may be full or disabled; the next visit just shows the catalog's PDF.
  }
}
