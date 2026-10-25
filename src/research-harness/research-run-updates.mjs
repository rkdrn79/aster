import { constants } from 'node:fs'
import { copyFile, lstat, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { sha256OfFile } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { appendMetricEvent, checkedMetricName, metricEvent } from './research-metric-events.mjs'
import {
  appendRunMedia,
  checkedMediaDetails,
  checkedMediaKind,
  isInsideProject,
  mediaKindOfPath,
  mediaRow,
  projectMediaPath
} from './research-run-media.mjs'
import {
  HARNESS_SOURCE,
  harnessLiveness,
  readRunManifest,
  resolveRunReference,
  updateRunManifest
} from './research-run-manifest.mjs'
import { organizeEndedRun } from './research-run-summary.mjs'

const finishStates = new Set(['succeeded', 'failed', 'cancelled'])
const artifactModes = new Set(['copy', 'reference'])
const stderrNotice = (message) => process.stderr.write(`[aster] ${message}\n`)

export async function logMetric(projectPath, reference, input) {
  const project = await realpath(projectPath)
  const run = await resolveRunReference(project, reference)
  const metrics = {}
  for (const [name, value] of Object.entries(input.metrics ?? {})) {
    metrics[checkedMetricName(name)] = value
  }
  if (!Object.keys(metrics).length) {
    throw new HarnessError('usage', 'Pass at least one metric as name=value')
  }
  const event = metricEvent(
    run.runId,
    { step: input.step, split: input.split, timestamp: input.timestamp, metrics },
    new Date().toISOString()
  )
  await appendMetricEvent(run.paths.metrics, event)
  return { ref: run.ref, event }
}

/**
 * Reports the end of a Run whose process the harness did not wrap, such as a SLURM job, and
 * writes its summary.json.
 */
export async function finishRun(projectPath, reference, input, { notice = stderrNotice } = {}) {
  if (!finishStates.has(input.status)) {
    throw new HarnessError('invalid_argument', 'Status must be succeeded, failed, or cancelled')
  }
  if (
    input.exitCode !== undefined &&
    input.exitCode !== null &&
    !Number.isInteger(input.exitCode)
  ) {
    throw new HarnessError('invalid_argument', 'Exit code must be an integer')
  }
  const project = await realpath(projectPath)
  const run = await resolveRunReference(project, reference)
  const existing = await readRunManifest(run.paths)
  if (!input.force && harnessLiveness(existing) === 'alive') {
    throw new HarnessError(
      'run_active',
      `${run.ref} is still running under run exec on ${os.hostname()}; it records its own exit`
    )
  }
  if (!input.force && existing.execution?.evidence === 'process-exit') {
    throw new HarnessError(
      'already_finished',
      `${run.ref} already has an observed ${existing.execution.state} exit; pass --force to override it`
    )
  }
  const observedAt = new Date().toISOString()
  const manifest = await updateRunManifest(run.paths, (current) => ({
    ...current,
    execution: {
      state: input.status,
      reportedBy: 'manifest',
      observedAt,
      exitCode: input.exitCode ?? null,
      source: HARNESS_SOURCE,
      evidence: 'reported',
      ...(input.note ? { note: input.note } : {})
    },
    ...(current.launch && !current.launch.finishedAt
      ? {
          launch: {
            ...current.launch,
            finishedAt: observedAt,
            durationMs: Date.parse(observedAt) - Date.parse(current.launch.startedAt)
          }
        }
      : {}),
    harness: { ...current.harness, status: 'reported' }
  }))
  await organizeEndedRun(project, run.ref, notice)
  return { ref: run.ref, execution: manifest.execution }
}

function checkedArtifactName(name) {
  if (!name || name === '.' || name === '..' || /[\\/\0]/u.test(name) || name.length > 200) {
    throw new HarnessError('invalid_argument', `Artifact name must be a plain file name: ${name}`)
  }
  return name
}

/**
 * The media.jsonl row of an attached file. --kind/--step/--label/--sample ask for one and are
 * refused when the file cannot be media; otherwise only media files inside the project get one.
 */
function attachedMediaRow(project, input, recorded, bytes) {
  const details = {
    step: input.step ?? null,
    label: input.label ?? null,
    sampleId: input.sampleId ?? null
  }
  const requested = Boolean(input.kind) || Object.values(details).some((value) => value !== null)
  if (!requested && !(mediaKindOfPath(recorded) && isInsideProject(project, recorded))) {
    return null
  }
  return mediaRow({
    kind: checkedMediaKind(recorded, input.kind ?? null),
    path: projectMediaPath(project, recorded),
    bytes,
    details: checkedMediaDetails(details),
    source: 'attach'
  })
}

export async function attachArtifact(projectPath, reference, input) {
  const mode = input.mode ?? 'copy'
  if (!artifactModes.has(mode)) {
    throw new HarnessError('invalid_argument', 'Artifact mode must be copy or reference')
  }
  const project = await realpath(projectPath)
  const run = await resolveRunReference(project, reference)
  const source = await realpath(path.resolve(input.cwd ?? process.cwd(), input.file))
  const details = await stat(source)
  if (!details.isFile()) {
    throw new HarnessError('invalid_argument', `Artifact must be a regular file: ${input.file}`)
  }
  const name = checkedArtifactName(input.name ?? path.basename(source))
  const media = attachedMediaRow(
    project,
    input,
    mode === 'copy' ? path.join(run.paths.artifacts, name) : source,
    details.size
  )
  const existing = (await readRunManifest(run.paths)).artifacts?.files ?? []
  if (existing.some((file) => file.name === name)) {
    throw new HarnessError('already_exists', `${run.ref} already has an artifact named ${name}`)
  }
  const sha256 = await sha256OfFile(source)
  let recordedPath = source
  if (mode === 'copy') {
    const target = path.join(run.paths.artifacts, name)
    const artifactsDirectory = await lstat(run.paths.artifacts)
    if (!artifactsDirectory.isDirectory() || artifactsDirectory.isSymbolicLink()) {
      throw new HarnessError('invalid_layout', `Not a real directory: ${run.paths.artifacts}`)
    }
    await copyFile(source, target, constants.COPYFILE_EXCL)
    recordedPath = `artifacts/${name}`
  }
  const record = {
    name,
    mode,
    path: recordedPath,
    source,
    bytes: details.size,
    sha256,
    attachedAt: new Date().toISOString()
  }
  await updateRunManifest(run.paths, (current) => {
    const files = current.artifacts?.files ?? []
    if (files.some((file) => file.name === name)) {
      throw new HarnessError('already_exists', `${run.ref} already has an artifact named ${name}`)
    }
    return { ...current, artifacts: { ...current.artifacts, files: [...files, record] } }
  })
  if (media) {
    await appendRunMedia(run.paths.run, media)
  }
  return { ref: run.ref, artifact: record, media }
}
