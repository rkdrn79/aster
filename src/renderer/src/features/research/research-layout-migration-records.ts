import type { ResearchLibraryDocument } from '../../../../shared/research/research-library'
import {
  movedProjectPath,
  type ResearchLayoutMove
} from '../../../../shared/research/research-layout-migration'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import { useResearchLibrary } from './research-library-store'
import { useResearchRecords } from './research-records-store'

export type MigratedWorkspace = { hostId: string; workspacePath: string }

/**
 * App records of one workspace pointed at where `migrate` moved their files. Without this, Runs
 * keep paths under research/ that no longer exist, and catalog sync adds each Run a second time.
 */
export function migratedResearchDocument(
  document: ResearchDocument,
  workspace: MigratedWorkspace,
  moves: readonly ResearchLayoutMove[]
): ResearchDocument {
  const move = (value: string): string => movedProjectPath(workspace.workspacePath, value, moves)
  const inWorkspace = (record: { hostId: string; workspacePath: string }): boolean =>
    record.hostId === workspace.hostId && record.workspacePath === workspace.workspacePath
  const experimentIds = new Set(document.experiments.filter(inWorkspace).map((item) => item.id))
  return {
    ...document,
    experiments: document.experiments.map((experiment) =>
      inWorkspace(experiment) && experiment.manuscript
        ? {
            ...experiment,
            manuscript: {
              sourcePath: move(experiment.manuscript.sourcePath),
              pdfPath: experiment.manuscript.pdfPath
                ? move(experiment.manuscript.pdfPath)
                : experiment.manuscript.pdfPath
            }
          }
        : experiment
    ),
    runs: document.runs.map((run) =>
      inWorkspace(run)
        ? {
            ...run,
            sourcePath: move(run.sourcePath),
            logPath: run.logPath ? move(run.logPath) : run.logPath,
            configPath: run.configPath ? move(run.configPath) : run.configPath,
            outputsPath: run.outputsPath ? move(run.outputsPath) : run.outputsPath,
            manifestPath: run.manifestPath ? move(run.manifestPath) : run.manifestPath
          }
        : run
    ),
    papers: document.papers.map((paper) =>
      experimentIds.has(paper.experimentId) && paper.pdfPath
        ? { ...paper, pdfPath: move(paper.pdfPath) }
        : paper
    ),
    detachedCatalogRunSourceKeys: document.detachedCatalogRunSourceKeys.map((key) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(key)
      } catch {
        return key
      }
      if (
        !Array.isArray(parsed) ||
        parsed[0] !== workspace.hostId ||
        typeof parsed[2] !== 'string'
      ) {
        return key
      }
      return JSON.stringify([parsed[0], parsed[1], move(parsed[2])])
    })
  }
}

export function migratedLibraryDocument(
  document: ResearchLibraryDocument,
  workspace: MigratedWorkspace,
  moves: readonly ResearchLayoutMove[]
): ResearchLibraryDocument {
  return {
    ...document,
    papers: document.papers.map((paper) =>
      paper.pdfPath &&
      paper.scope.hostId === workspace.hostId &&
      paper.scope.workspacePath === workspace.workspacePath
        ? { ...paper, pdfPath: movedProjectPath(workspace.workspacePath, paper.pdfPath, moves) }
        : paper
    )
  }
}

/** Rewrites the stored Experiment, Run and Library paths after a successful `migrate`. */
export async function applyLayoutMigrationToRecords(
  workspace: MigratedWorkspace,
  moves: readonly ResearchLayoutMove[]
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((document) => migratedResearchDocument(document, workspace, moves))
  // Why: a window whose preload predates the Library has no Library records to move.
  if (!window.api.researchLibrary?.read) {
    return
  }
  await useResearchLibrary
    .getState()
    .update((document) => migratedLibraryDocument(document, workspace, moves))
}
