import { posix } from 'node:path'
import {
  RESEARCH_PROJECT_API_VERSION,
  RESEARCH_PROJECT_LOG_TAIL_DEFAULT_BYTES,
  RESEARCH_PROJECT_LOG_TAIL_MAX_BYTES,
  RESEARCH_PROJECT_METRIC_POINTS_DEFAULT,
  RESEARCH_PROJECT_METRIC_POINTS_MAX,
  type ResearchProjectRunLogTailResult,
  type ResearchProjectRunReadResult
} from '../../shared/research/research-project-api'
import { researchRunManifestSchema } from '../../shared/research/research-run-manifest'
import {
  researchRunMediaItemSchema,
  type ResearchRunMediaItem
} from '../../shared/research/research-run-media'
import { researchRunSummarySchema } from '../../shared/research/research-run-summary'
import {
  RESEARCH_PROJECT_JSON_MAX_BYTES,
  checkedResearchRunName,
  findResearchProjectCatalogRun,
  readResearchProjectCatalog,
  researchProjectRunFiles,
  researchRunManifestArtifactsSchema
} from './research-project-catalog-read'
import {
  listResearchProjectFolder,
  parseResearchProjectFile,
  readResearchProjectBytes,
  readResearchProjectJson,
  readResearchProjectJsonlHead,
  resolveResearchProjectPath,
  unreadableResearchProjectFile,
  type ResearchProjectRoot
} from './research-project-files'
import {
  downsampledResearchMetricSeries,
  readResearchProjectMetrics
} from './research-project-metrics'

// The reply must stay well under the 4 MiB remote frame (remote-runtime-memory-limits.ts).
const METRICS_MAX_BYTES = 8 * 1024 * 1024
const MAX_SERIES = 32
const FOLDER_MAX_ENTRIES = 200
const JSONL_MAX_BYTES = 1024 * 1024
const MEDIA_MAX_ITEMS = 200

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)))
}

async function readMedia(
  root: ResearchProjectRoot,
  relativePath: string
): Promise<ResearchProjectRunReadResult['media']> {
  const file = await readResearchProjectJsonlHead(root, relativePath, JSONL_MAX_BYTES)
  if (file.status !== 'present') {
    return file
  }
  const items: ResearchRunMediaItem[] = []
  let malformedLines = 0
  for (const line of file.value.lines) {
    if (items.length >= MEDIA_MAX_ITEMS) {
      break
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      malformedLines += 1
      continue
    }
    const item = researchRunMediaItemSchema.safeParse(parsed)
    if (item.success) {
      items.push(item.data)
    } else {
      malformedLines += 1
    }
  }
  return {
    status: 'present',
    value: {
      items,
      malformedLines,
      truncated: file.value.truncated || items.length + malformedLines < file.value.lines.length
    }
  }
}

async function readOutputs(
  root: ResearchProjectRoot,
  relativePath: string
): Promise<ResearchProjectRunReadResult['outputs']> {
  const file = await readResearchProjectJsonlHead(root, relativePath, JSONL_MAX_BYTES)
  return file.status === 'present'
    ? {
        status: 'present',
        value: {
          bytes: file.value.size,
          rows: file.value.lines.length,
          truncated: file.value.truncated
        }
      }
    : file
}

async function readArtifactFolder(
  root: ResearchProjectRoot,
  relativePath: string
): Promise<ResearchProjectRunReadResult['artifacts']['directory']> {
  try {
    const listing = await listResearchProjectFolder(
      await resolveResearchProjectPath(root, relativePath),
      FOLDER_MAX_ENTRIES
    )
    return listing ? { status: 'present', value: listing } : { status: 'absent' }
  } catch (error) {
    return unreadableResearchProjectFile(error)
  }
}

/** run.json, summary.json, downsampled metric series, and the Run's artifacts, media and outputs. */
export async function readResearchProjectRun(
  root: ResearchProjectRoot,
  params: { experiment: string; run: string; maxPoints?: number }
): Promise<ResearchProjectRunReadResult> {
  const { slug, runId } = checkedResearchRunName(params.experiment, params.run)
  const entry = findResearchProjectCatalogRun(await readResearchProjectCatalog(root), slug, runId)
  const files = researchProjectRunFiles(root, slug, runId, entry)
  const raw = await readResearchProjectJson(root, files.manifest, RESEARCH_PROJECT_JSON_MAX_BYTES)
  const manifest = parseResearchProjectFile(raw, researchRunManifestSchema, 'run.json')
  const definitions =
    manifest.status === 'present' ? (manifest.value.metrics?.definitions ?? {}) : {}
  const recorded =
    raw.status === 'present' ? researchRunManifestArtifactsSchema.safeParse(raw.value) : null
  const maxPoints = clamp(
    params.maxPoints ?? RESEARCH_PROJECT_METRIC_POINTS_DEFAULT,
    2,
    RESEARCH_PROJECT_METRIC_POINTS_MAX
  )
  const [summary, metrics, directory, media, outputs] = await Promise.all([
    readResearchProjectJson(
      root,
      `${files.dir}/summary.json`,
      RESEARCH_PROJECT_JSON_MAX_BYTES
    ).then((file) => parseResearchProjectFile(file, researchRunSummarySchema, 'summary.json')),
    readResearchProjectMetrics(root, files.metrics, METRICS_MAX_BYTES),
    readArtifactFolder(root, `${files.dir}/artifacts`),
    readMedia(root, `${files.dir}/media.jsonl`),
    readOutputs(root, `${files.dir}/outputs.jsonl`)
  ])
  return {
    version: RESEARCH_PROJECT_API_VERSION,
    experiment: slug,
    run: runId,
    catalogEntry: entry,
    manifest,
    summary,
    metrics:
      metrics.status === 'present'
        ? {
            status: 'present',
            value: {
              bytes: metrics.value.bytes,
              partial: metrics.value.partial,
              rows: metrics.value.grouped.rows,
              malformedLines: metrics.value.grouped.malformedLines,
              ...downsampledResearchMetricSeries(
                metrics.value.grouped,
                definitions,
                MAX_SERIES,
                maxPoints
              )
            }
          }
        : metrics,
    artifacts: {
      directory,
      recorded: recorded?.success
        ? (recorded.data.artifacts?.files ?? []).flatMap((file) => (file ? [file] : []))
        : []
    },
    media,
    outputs,
    readAt: new Date().toISOString()
  }
}

/** The end of the Run's log: the catalog's log path, else run.json's, else train.log. */
export async function readResearchProjectRunLogTail(
  root: ResearchProjectRoot,
  params: { experiment: string; run: string; maxBytes?: number }
): Promise<ResearchProjectRunLogTailResult> {
  const { slug, runId } = checkedResearchRunName(params.experiment, params.run)
  const catalog = await readResearchProjectCatalog(root)
  const files = researchProjectRunFiles(
    root,
    slug,
    runId,
    findResearchProjectCatalogRun(catalog, slug, runId)
  )
  let logPath = files.log
  if (!logPath) {
    const raw = await readResearchProjectJson(root, files.manifest, RESEARCH_PROJECT_JSON_MAX_BYTES)
    const recorded =
      raw.status === 'present' ? researchRunManifestArtifactsSchema.safeParse(raw.value) : null
    const manifestLog = recorded?.success ? recorded.data.artifacts?.log : null
    // Why concatenate, not join: join would fold `..` away before the path check could refuse it.
    logPath = manifestLog
      ? `${posix.dirname(files.manifest)}/${manifestLog}`
      : `${files.dir}/train.log`
  }
  const maxBytes = clamp(
    params.maxBytes ?? RESEARCH_PROJECT_LOG_TAIL_DEFAULT_BYTES,
    1,
    RESEARCH_PROJECT_LOG_TAIL_MAX_BYTES
  )
  const read = await readResearchProjectBytes(
    await resolveResearchProjectPath(root, logPath),
    maxBytes,
    'end'
  )
  const base: Pick<ResearchProjectRunLogTailResult, 'version' | 'path' | 'readAt'> = {
    version: RESEARCH_PROJECT_API_VERSION,
    path: logPath,
    readAt: new Date().toISOString()
  }
  if (!read) {
    return { ...base, status: 'absent', text: '', truncated: false, size: 0 }
  }
  const text = read.bytes.toString('utf8')
  const firstBreak = text.indexOf('\n')
  return {
    ...base,
    status: 'present',
    // Why keep a line-less window whole: a progress-bar log may have no newline in it at all.
    text: read.offset > 0 && firstBreak !== -1 ? text.slice(firstBreak + 1) : text,
    truncated: read.offset > 0,
    size: read.size
  }
}
