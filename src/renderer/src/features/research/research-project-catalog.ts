import { z } from 'zod'
import {
  isRuntimePathAbsolute,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../../../../shared/cross-platform-path'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { RESEARCH_RECORD_ROOTS } from '../../../../shared/research/research-run-reference'
import { RESEARCH_PROJECT_API_VERSION } from '../../../../shared/research/research-project-api'
import { authorityKey, parseHostAuthorityKey } from '../../../../shared/host-authority'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/runtime-client-target'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { readResearchTextFile } from './research-file-reader'

const catalogRunSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  manifest: z.string().min(1),
  metrics: z.string().min(1),
  log: z.string().min(1).nullable(),
  config: z.string().min(1).nullable()
})

// Version 2 is `.aster/project.json` (ADR-004), whose Experiments and Runs the harness reads from
// their folders; it reaches the renderer in the same shape as a version 1 `research/project.json`.
const projectCatalogSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  manuscript: z.object({
    source: z.string().min(1),
    pdf: z.string().min(1).nullable()
  }),
  experiments: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      path: z.string().min(1),
      runs: z.array(catalogRunSchema)
    })
  )
})

export type ProjectCatalog = z.infer<typeof projectCatalogSchema>
export type CatalogRun = ProjectCatalog['experiments'][number]['runs'][number] & {
  experimentName: string
  experimentSlug: string
}

/** Written before ADR-004; read directly when this window's preload cannot ask the harness. */
const LEGACY_CATALOG_PATH = 'research/project.json'

/** Whether a catalog path lies in a record tree (`.aster/`, or `research/` before ADR-004). */
function isRecordPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  return RESEARCH_RECORD_ROOTS.some((root) => normalized.startsWith(`${root}/`))
}

/** A project-relative catalog path as an absolute path; refuses anything outside the project. */
export function catalogWorkspacePath(workspacePath: string, path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (
    path.includes('\0') ||
    isRuntimePathAbsolute(path) ||
    /^[A-Za-z]:/.test(path) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`The project catalog lists a path outside the project: ${path}`)
  }
  const absolute = resolveRuntimePath(workspacePath, path)
  if (!relativePathInsideRoot(workspacePath, absolute)) {
    throw new Error(`The project catalog lists a path outside the project: ${path}`)
  }
  return absolute
}

/** Experiment and Run files must stay in the record tree; the manuscript may live anywhere. */
function recordWorkspacePath(workspacePath: string, path: string): string {
  if (!isRecordPath(path)) {
    throw new Error(`The project catalog lists a Run file outside its record folder: ${path}`)
  }
  return catalogWorkspacePath(workspacePath, path)
}

export function parseProjectCatalog(content: string, workspacePath: string): ProjectCatalog {
  return parseProjectCatalogValue(JSON.parse(content), workspacePath)
}

export function parseProjectCatalogValue(value: unknown, workspacePath: string): ProjectCatalog {
  const catalog = projectCatalogSchema.parse(value)
  const manuscript = catalog.manuscript
  if (!manuscript.source.toLowerCase().endsWith('.tex')) {
    throw new Error('Project catalog: the manuscript source must be a .tex file.')
  }
  if (manuscript.pdf && !manuscript.pdf.toLowerCase().endsWith('.pdf')) {
    throw new Error('Project catalog: the manuscript PDF must be a .pdf file.')
  }
  catalogWorkspacePath(workspacePath, manuscript.source)
  if (manuscript.pdf) {
    catalogWorkspacePath(workspacePath, manuscript.pdf)
  }
  for (const experiment of catalog.experiments) {
    recordWorkspacePath(workspacePath, experiment.path)
    for (const run of experiment.runs) {
      for (const path of [run.manifest, run.metrics, run.log, run.config]) {
        if (path) {
          recordWorkspacePath(workspacePath, path)
        }
      }
      if (!/\.(jsonl|csv)$/i.test(run.metrics) || !run.manifest.toLowerCase().endsWith('.json')) {
        throw new Error(`Run ${run.name} has an unsupported metrics or manifest path.`)
      }
    }
  }
  return catalog
}

/**
 * The project's catalog through the harness, which finds `.aster/` or a pre-ADR-004 `research/`
 * tree and lists `.aster` Runs from their folders. A window whose preload predates that bridge
 * reads `research/project.json` itself.
 */
export async function readProjectCatalog(
  experiment: Pick<ExperimentRecord, 'hostId' | 'workspaceId' | 'workspacePath'>
): Promise<ProjectCatalog> {
  const readCatalog = window.api.researchProjectLayout?.readCatalog
  if (typeof readCatalog === 'function' && experiment.hostId === 'local') {
    const value = await readCatalog({ workspacePath: experiment.workspacePath })
    if (value === null) {
      throw new Error('This project has no .aster/project.json yet.')
    }
    return parseProjectCatalogValue(value, experiment.workspacePath)
  }
  const authority = parseHostAuthorityKey(experiment.hostId)
  if (authority?.at === 'local' && authority.endpoint.kind === 'environment') {
    const target = runtimeRpcTargetForAuthorityKey(authorityKey(authority))
    if (!target || !experiment.workspaceId) {
      throw new Error('The workspace host is unavailable.')
    }
    const response: unknown = await callRuntimeRpc(target, 'researchProject.read', {
      worktree: `id:${experiment.workspaceId}`
    })
    const result = z
      .object({
        version: z.literal(RESEARCH_PROJECT_API_VERSION),
        catalog: z.discriminatedUnion('status', [
          z.object({ status: z.literal('present'), value: z.unknown() }),
          z.object({ status: z.literal('absent') }),
          z.object({ status: z.literal('unreadable'), reason: z.string() }),
          z.object({ status: z.literal('skipped') })
        ])
      })
      .parse(response)
    if (result.catalog.status === 'present') {
      return parseProjectCatalogValue(result.catalog.value, experiment.workspacePath)
    }
    throw new Error(
      result.catalog.status === 'unreadable'
        ? result.catalog.reason
        : 'No research project catalog is available on this host.'
    )
  }
  if (experiment.hostId !== 'local') {
    throw new Error('This host does not support research project catalog reads.')
  }
  const catalogPath = catalogWorkspacePath(experiment.workspacePath, LEGACY_CATALOG_PATH)
  const content = await readResearchTextFile(experiment, catalogPath, 1024 * 1024)
  return parseProjectCatalog(content, experiment.workspacePath)
}

export function catalogRuns(catalog: ProjectCatalog): CatalogRun[] {
  return catalog.experiments.flatMap((experiment) =>
    experiment.runs.map((run) => ({
      ...run,
      experimentName: experiment.name,
      experimentSlug: experiment.slug
    }))
  )
}

export function unlinkedCatalogRuns(
  catalog: ProjectCatalog,
  experiment: ExperimentRecord,
  attached: ResearchRunRecord[]
): CatalogRun[] {
  return catalogRuns(catalog).filter(
    (run) =>
      run.experimentSlug === experiment.catalogSlug &&
      !attached.some(
        (item) => item.sourcePath === catalogWorkspacePath(experiment.workspacePath, run.metrics)
      )
  )
}
