import os from 'node:os'
import { readFile } from 'node:fs/promises'
import { readCatalog } from './research-catalog.mjs'
import { withFileLock, writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  layoutRelativePaths,
  runPaths,
  runReference,
  safeExperimentSlug,
  safeIdentifier
} from './research-layout.mjs'

export const HARNESS_SOURCE = 'aster-harness'
export const HEARTBEAT_INTERVAL_MS = 60_000

export async function readRunManifest(paths) {
  return JSON.parse(await readFile(paths.manifest, 'utf8'))
}

export async function updateRunManifest(paths, transform) {
  return withFileLock(`${paths.manifest}.lock`, async () => {
    const next = transform(await readRunManifest(paths))
    await writeJsonAtomically(paths.manifest, next)
    return next
  })
}

/** Accepts `experiment/run`, or a bare run ID that is unique in the catalog. */
export async function resolveRunReference(project, reference) {
  if (typeof reference !== 'string' || !reference.trim()) {
    throw new HarnessError('usage', 'A Run reference like <experiment>/<run> is required')
  }
  const parts = reference.trim().split('/')
  if (parts.length > 2) {
    throw new HarnessError('invalid_argument', `Invalid Run reference: ${reference}`)
  }
  const [slug, runId] = parts.length === 2 ? parts : [null, parts[0]]
  safeIdentifier(runId, 'Run ID')
  if (slug !== null) {
    safeExperimentSlug(slug)
  }
  const catalog = await readCatalog(project)
  const matches = []
  for (const experiment of catalog.experiments) {
    if (slug !== null && experiment.slug !== slug) {
      continue
    }
    const entry = (experiment.runs ?? []).find((run) => run.id === runId)
    if (entry) {
      matches.push({ experiment, entry })
    }
  }
  if (matches.length === 0) {
    throw new HarnessError(
      'run_not_found',
      `Run not found in ${layoutRelativePaths(project).catalog}: ${reference}`
    )
  }
  if (matches.length > 1) {
    throw new HarnessError(
      'ambiguous_run',
      `Run ID ${runId} exists in several Experiments; use <experiment>/<run>`
    )
  }
  const [{ experiment, entry }] = matches
  return {
    ref: runReference(experiment.slug, entry.id),
    experiment: experiment.slug,
    experimentName: experiment.name,
    runId: entry.id,
    entry,
    paths: runPaths(project, experiment.slug, entry.id)
  }
}

export function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

/** Only a same-host PID check is proof that a harness is gone; other hosts stay unknown. */
export function harnessLiveness(manifest) {
  const launch = manifest?.launch
  if (manifest?.execution?.state !== 'running' || launch?.by !== HARNESS_SOURCE) {
    return null
  }
  if (launch.host !== os.hostname()) {
    return 'unknown'
  }
  return processIsAlive(launch.harnessPid ?? launch.pid) ? 'alive' : 'exited'
}

export function runStatusSummary(manifest) {
  const execution = manifest?.execution
  return {
    state: execution?.state ?? 'unknown',
    exitCode: execution?.exitCode ?? null,
    observedAt: execution?.observedAt ?? null,
    startedAt: manifest?.launch?.startedAt ?? null,
    finishedAt: manifest?.launch?.finishedAt ?? null,
    durationMs: manifest?.launch?.durationMs ?? null,
    liveness: harnessLiveness(manifest)
  }
}
