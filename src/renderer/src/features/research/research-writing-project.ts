import type {
  ExperimentRecord,
  ResearchDocument
} from '../../../../shared/research/research-records'
import { relativePathInsideRoot } from '../../../../shared/cross-platform-path'
import { useResearchRecords } from './research-records-store'
import { readProjectCatalog } from './research-project-catalog'
import { resolveManuscriptFile, statManuscriptSource } from './research-writing-source'

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
export function projectWritingRecordId(
  scope: Pick<WritingProjectScope, 'hostId' | 'workspaceId'>
): string {
  return `project:${scope.hostId}:${scope.workspaceId}`
}

export function projectWritingRecord(
  scope: WritingProjectScope,
  manuscript: ExperimentRecord['manuscript']
): ExperimentRecord {
  return {
    id: projectWritingRecordId(scope),
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
    (cause: unknown) => {
      if (isMissingCatalog(cause)) {
        return false
      }
      throw cause
    }
  )
}

function isMissingFile(cause: unknown): boolean {
  const message = String(cause)
  return /ENOENT|no such file|file not found|does not exist/i.test(message)
}

function isMissingCatalog(cause: unknown): boolean {
  const message = String(cause)
  return (
    isMissingFile(cause) ||
    /This project has no \.aster\/project\.json yet\.|No research project catalog is available on this host\./.test(
      message
    )
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
  if (!hasExperiments) {
    saveProjectManuscriptPath(scope, file.relativePath)
  }
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

/** A valid linked TeX stays authoritative when a remote catalog lags behind it. */
export async function readWritingManuscript(
  scope: WritingProjectScope,
  linked: ExperimentRecord['manuscript']
): Promise<ExperimentRecord['manuscript']> {
  if (!linked) {
    return readCatalogManuscript(scope)
  }
  try {
    await statManuscriptSource(scope, resolveManuscriptFile(scope, linked.sourcePath, '.tex'))
    return linked
  } catch (cause) {
    if (!isMissingFile(cause)) {
      throw cause
    }
  }
  return (await readCatalogManuscript(scope)) ?? linked
}

/** The catalog's manuscript of a project, or the previously selected existing file. */
export async function readCatalogManuscript(
  scope: WritingProjectScope
): Promise<ExperimentRecord['manuscript']> {
  const selected = readProjectManuscriptPath(scope)
  try {
    const catalog = await readProjectCatalog(scope)
    const manuscript = { sourcePath: catalog.manuscript.source, pdfPath: catalog.manuscript.pdf }
    if (selected && selected !== manuscript.sourcePath) {
      try {
        await statManuscriptSource(
          scope,
          resolveManuscriptFile(scope, manuscript.sourcePath, '.tex')
        )
      } catch (cause) {
        if (isMissingFile(cause)) {
          const previous = await readExistingManuscript(scope, selected)
          if (previous) {
            return previous
          }
        }
      }
    }
    return manuscript
  } catch (cause) {
    if (!isMissingCatalog(cause)) {
      throw cause
    }
    return readExistingManuscript(scope, selected ?? 'paper/main.tex')
  }
}

async function readExistingManuscript(
  scope: WritingProjectScope,
  sourcePath: string
): Promise<ExperimentRecord['manuscript']> {
  try {
    await statManuscriptSource(scope, resolveManuscriptFile(scope, sourcePath, '.tex'))
  } catch (cause) {
    if (isMissingFile(cause)) {
      return undefined
    }
    throw cause
  }
  const pdfPathBesideSource = sourcePath.replace(/\.tex$/i, '.pdf')
  const pdfCandidates =
    sourcePath === 'paper/main.tex'
      ? [pdfPathBesideSource, 'paper/build/main.pdf']
      : [pdfPathBesideSource]
  for (const pdfPath of pdfCandidates) {
    try {
      await statManuscriptSource(scope, resolveManuscriptFile(scope, pdfPath, '.pdf'))
      return { sourcePath, pdfPath }
    } catch (cause) {
      if (!isMissingFile(cause)) {
        throw cause
      }
    }
  }
  return { sourcePath, pdfPath: null }
}

const PROJECT_PDF_PREFIX = 'aster.research-writing-project-pdf.v1:'
const PROJECT_SOURCE_PREFIX = 'aster.research-writing-project-source.v1:'

function projectSourceKey(scope: WritingProjectScope): string {
  return `${PROJECT_SOURCE_PREFIX}${scope.hostId}:${scope.workspaceId}`
}

function readProjectManuscriptPath(scope: WritingProjectScope): string | null {
  try {
    return localStorage.getItem(projectSourceKey(scope))
  } catch {
    return null
  }
}

function saveProjectManuscriptPath(scope: WritingProjectScope, path: string): void {
  localStorage.setItem(projectSourceKey(scope), path)
}

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
