import { z } from 'zod'
import { experimentRelativePath } from '../../research-harness/research-layout.mjs'
import { researchExperimentBriefSchema } from '../../shared/research/research-experiment-brief'
import {
  RESEARCH_PROJECT_API_VERSION,
  type ResearchProjectCatalogRun,
  type ResearchProjectReadResult,
  type ResearchProjectRunOverview
} from '../../shared/research/research-project-api'
import { researchRunManifestSchema } from '../../shared/research/research-run-manifest'
import {
  RESEARCH_PROJECT_JSON_MAX_BYTES,
  readResearchProjectCatalog,
  researchProjectRunFiles
} from './research-project-catalog-read'
import {
  parseResearchProjectFile,
  readResearchProjectJson,
  type ResearchProjectRoot
} from './research-project-files'
import { readResearchProjectLoopSummary } from './research-project-loop-summary'
import { lastResearchMetricValues, readResearchProjectMetrics } from './research-project-metrics'

// The newest Runs of each Experiment, with totals that bound both disk reads and the reply size.
const RUNS_PER_EXPERIMENT = 20
const MAX_READ_RUNS = 400
const MAX_READ_BYTES = 8 * 1024 * 1024
const METRICS_TAIL_BYTES = 64 * 1024
const SERIES_PER_RUN = 6

const experimentMetadataSchema = z.object({
  brief: researchExperimentBriefSchema.nullable().catch(null)
})

type OverviewBudget = { bytes: number; runs: number; exhausted: boolean }

async function readRunOverview(
  root: ResearchProjectRoot,
  slug: string,
  entry: ResearchProjectCatalogRun,
  budget: OverviewBudget
): Promise<ResearchProjectRunOverview> {
  const unread = {
    id: entry.id,
    name: entry.name,
    state: 'unknown',
    exitCode: null,
    startedAt: null,
    finishedAt: null
  } as const
  if (budget.bytes >= MAX_READ_BYTES || budget.runs >= MAX_READ_RUNS) {
    budget.exhausted = true
    return { ...unread, manifest: 'skipped', metrics: { status: 'skipped' } }
  }
  budget.runs += 1
  const charge = (bytes: number): void => {
    budget.bytes += bytes
  }
  const files = researchProjectRunFiles(root, slug, entry.id, entry)
  const manifest = parseResearchProjectFile(
    await readResearchProjectJson(root, files.manifest, RESEARCH_PROJECT_JSON_MAX_BYTES, charge),
    researchRunManifestSchema,
    'run.json'
  )
  const value = manifest.status === 'present' ? manifest.value : null
  const metrics = await readResearchProjectMetrics(root, files.metrics, METRICS_TAIL_BYTES, charge)
  return {
    ...unread,
    state: value?.execution?.state ?? 'unknown',
    exitCode: value?.execution?.exitCode ?? null,
    startedAt: value?.launch?.startedAt ?? null,
    finishedAt: value?.launch?.finishedAt ?? null,
    manifest: manifest.status,
    metrics:
      metrics.status === 'present'
        ? {
            status: 'present',
            value: {
              ...lastResearchMetricValues(
                metrics.value.grouped,
                value?.metrics?.definitions ?? {},
                SERIES_PER_RUN
              ),
              partial: metrics.value.partial
            }
          }
        : metrics
  }
}

/** The catalog and, per Experiment, its brief and its newest Runs with their latest metrics. */
export async function readResearchProject(
  root: ResearchProjectRoot
): Promise<ResearchProjectReadResult> {
  const catalog = await readResearchProjectCatalog(root)
  const experiments = catalog.file.status === 'present' ? catalog.file.value.experiments : []
  const budget: OverviewBudget = { bytes: 0, runs: 0, exhausted: false }
  const overviews = new Map<ResearchProjectCatalogRun, ResearchProjectRunOverview>()
  const shown = experiments.map((experiment) => ({
    experiment,
    runs: experiment.runs.slice(-RUNS_PER_EXPERIMENT)
  }))
  // Why latest Runs first: every Experiment's current state outranks older history in the budget.
  for (const { experiment, runs } of shown) {
    const latest = runs.at(-1)
    if (latest) {
      overviews.set(latest, await readRunOverview(root, experiment.slug, latest, budget))
    }
  }
  for (const { experiment, runs } of shown) {
    for (const entry of runs.slice(0, -1).toReversed()) {
      overviews.set(entry, await readRunOverview(root, experiment.slug, entry, budget))
    }
  }
  const result: ResearchProjectReadResult['experiments'] = []
  for (const { experiment, runs: shownRuns } of shown) {
    const runs = shownRuns.flatMap((entry) => {
      const overview = overviews.get(entry)
      return overview ? [overview] : []
    })
    const metadata =
      budget.bytes < MAX_READ_BYTES
        ? parseResearchProjectFile(
            await readResearchProjectJson(
              root,
              `${experimentRelativePath(root.path, experiment.slug)}/experiment.json`,
              RESEARCH_PROJECT_JSON_MAX_BYTES,
              (bytes) => {
                budget.bytes += bytes
              }
            ),
            experimentMetadataSchema,
            'experiment.json'
          )
        : null
    const loop: ResearchProjectReadResult['experiments'][number]['loop'] =
      budget.bytes < MAX_READ_BYTES
        ? await readResearchProjectLoopSummary(root, experiment.slug, (bytes) => {
            budget.bytes += bytes
          })
        : { status: 'skipped' }
    result.push({
      slug: experiment.slug,
      name: experiment.name,
      brief: metadata?.status === 'present' ? metadata.value.brief : null,
      loop,
      runCount: experiment.runs.length,
      latestRun: runs.at(-1) ?? null,
      runs
    })
  }
  return {
    version: RESEARCH_PROJECT_API_VERSION,
    catalog: catalog.file,
    skippedCatalogEntries: catalog.skipped,
    experiments: result,
    truncated: budget.exhausted,
    readAt: new Date().toISOString()
  }
}
