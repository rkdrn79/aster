import { z } from 'zod'
import { readCatalog } from '../../research-harness/research-catalog.mjs'
import {
  layoutRelativePaths,
  runRelativePath,
  safeExperimentSlug,
  safeIdentifier
} from '../../research-harness/research-layout.mjs'
import {
  researchProjectCatalogSchema,
  researchProjectRecordedArtifactSchema,
  type ResearchProjectCatalog,
  type ResearchProjectCatalogRun,
  type ResearchProjectFile
} from '../../shared/research/research-project-api'
import { isENOENT } from '../ipc/filesystem-path-containment'
import {
  resolveResearchProjectPath,
  unreadableResearchProjectFile,
  type ResearchProjectRoot
} from './research-project-files'

// Same cap as research-run-files.ts.
export const RESEARCH_PROJECT_JSON_MAX_BYTES = 256 * 1024

const nullableText = z.string().nullable().catch(null)
// Why separate from researchRunManifestSchema: that one drops `artifacts`, which the harness writes.
export const researchRunManifestArtifactsSchema = z.object({
  artifacts: z
    .object({
      log: nullableText,
      files: z.array(researchProjectRecordedArtifactSchema.nullable().catch(null)).catch([])
    })
    .nullable()
    .catch(null)
})

export type ResearchProjectCatalogRead = {
  file: ResearchProjectFile<ResearchProjectCatalog>
  skipped: number
}

function passes(check: () => unknown): boolean {
  try {
    check()
    return true
  } catch {
    return false
  }
}

/** Experiment and Run names checked with the harness's own rules, so its folders always resolve. */
export function checkedResearchRunName(
  experiment: string,
  run: string
): { slug: string; runId: string } {
  return { slug: safeExperimentSlug(experiment), runId: safeIdentifier(run, 'Run ID') }
}

/** The catalog (project.json) without the entries whose slug or Run ID the harness would refuse. */
export async function readResearchProjectCatalog(
  root: ResearchProjectRoot
): Promise<ResearchProjectCatalogRead> {
  const catalog = layoutRelativePaths(root.path).catalog
  let raw: unknown
  try {
    // Why check first: the harness reads the layout as found and would follow a linked records folder.
    await resolveResearchProjectPath(root, catalog)
    raw = await readCatalog(root.path)
  } catch (error) {
    const absent =
      isENOENT(error) ||
      (error instanceof Error && Reflect.get(error, 'code') === 'project_not_found')
    return {
      file: absent ? { status: 'absent' } : unreadableResearchProjectFile(error),
      skipped: 0
    }
  }
  const parsed = researchProjectCatalogSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      file: { status: 'unreadable', reason: `Unsupported ${catalog} schema.` },
      skipped: 0
    }
  }
  let skipped = 0
  const experiments = parsed.data.experiments.flatMap((experiment) => {
    if (!experiment || !passes(() => safeExperimentSlug(experiment.slug))) {
      skipped += 1
      return []
    }
    const runs = experiment.runs.filter((run): run is ResearchProjectCatalogRun => {
      const safe = run !== null && passes(() => safeIdentifier(run.id, 'Run ID'))
      skipped += safe ? 0 : 1
      return safe
    })
    return [{ ...experiment, runs }]
  })
  return { file: { status: 'present', value: { ...parsed.data, experiments } }, skipped }
}

export function findResearchProjectCatalogRun(
  catalog: ResearchProjectCatalogRead,
  slug: string,
  runId: string
): ResearchProjectCatalogRun | null {
  return catalog.file.status === 'present'
    ? (catalog.file.value.experiments
        .find((experiment) => experiment.slug === slug)
        ?.runs.find((run) => run.id === runId) ?? null)
    : null
}

/** A Run's project-relative files: the catalog's paths when it lists the Run, else the harness layout. */
export function researchProjectRunFiles(
  root: ResearchProjectRoot,
  slug: string,
  runId: string,
  entry: ResearchProjectCatalogRun | null
): { dir: string; manifest: string; metrics: string; log: string | null } {
  const dir = runRelativePath(root.path, slug, runId)
  return {
    dir,
    manifest: entry?.manifest ?? `${dir}/run.json`,
    metrics: entry?.metrics ?? `${dir}/metrics.jsonl`,
    log: entry?.log ?? null
  }
}
