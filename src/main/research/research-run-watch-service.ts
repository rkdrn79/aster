import {
  researchRunManifestSchema,
  type ResearchRunManifest
} from '../../shared/research/research-run-manifest'
import type { ResearchRunWatch } from '../../shared/research/research-run-watch'
import type { ResearchSlurmRunLink } from '../../shared/research/research-slurm-run-links'
import {
  readResearchRunFiles,
  type ResearchRunFileStat,
  type ResearchRunFilesRead
} from './research-run-files'
import { advanceResearchRunWatch, researchWatchLocation } from './research-run-watch-advance'
import {
  deliverResearchWatchEvents,
  researchWatchNeedsDelivery,
  type ResearchWatchRuntime
} from './research-run-watch-delivery'
import { readResearchRunWatches, updateResearchRunWatches } from './research-run-watch-store'
import { latestSlurmLinkForRun, readResearchSlurmRunLinks } from './research-slurm-run-links'

const TICK_MS = 15_000
/** SSH reads stay at the SLURM tracker's pace; local reads are stat-gated and cheap. */
const REMOTE_CHECK_MS = 60_000
const REMOTE_FAILURE_BACKOFF_MS = 5 * 60_000
const LOCAL_READ_BYTES = 1024 * 1024
const REMOTE_READ_BYTES = 256 * 1024
const ENDED_RETENTION_MS = 7 * 24 * 60 * 60_000
/** A queued job moves the stall clock every pass; that alone is saved this often. */
const PROGRESS_ONLY_SAVE_MS = 5 * 60_000

type ManifestFacts = {
  stat: ResearchRunFileStat
  manifest: ResearchRunManifest | null
}

/** Parsed run.json per watch, so an unchanged local file is not re-read every pass. */
const manifestByWatch = new Map<string, ManifestFacts>()
const lastCheckAtByWatch = new Map<string, number>()
const remoteRetryAtByWatch = new Map<string, number>()
const progressAtByWatch = new Map<string, string>()

/** The newer stall clock of the saved watch and this process's unsaved one. */
function withLiveProgress(watch: ResearchRunWatch): ResearchRunWatch {
  const live = progressAtByWatch.get(watch.id)
  return live && live > watch.lastProgressAt ? { ...watch, lastProgressAt: live } : watch
}

function worthSaving(next: ResearchRunWatch, saved: ResearchRunWatch): boolean {
  if (
    JSON.stringify({ ...next, lastProgressAt: '' }) !==
    JSON.stringify({ ...saved, lastProgressAt: '' })
  ) {
    return true
  }
  return Date.parse(next.lastProgressAt) - Date.parse(saved.lastProgressAt) >= PROGRESS_ONLY_SAVE_MS
}

export function researchWatchLastCheckedAt(watchId: string): string | null {
  const at = lastCheckAtByWatch.get(watchId)
  return at === undefined ? null : new Date(at).toISOString()
}

function manifestFacts(watchId: string, read: ResearchRunFilesRead): ResearchRunManifest | null {
  const manifest = read.manifest
  if (!manifest) {
    manifestByWatch.delete(watchId)
    return null
  }
  if (manifest.content === null) {
    return manifestByWatch.get(watchId)?.manifest ?? null
  }
  let parsed: ResearchRunManifest | null = null
  try {
    const result = researchRunManifestSchema.safeParse(JSON.parse(manifest.content))
    parsed = result.success ? result.data : null
  } catch {
    parsed = null
  }
  manifestByWatch.set(watchId, { stat: manifest.stat, manifest: parsed })
  return parsed
}

function checkDue(watch: ResearchRunWatch, nowMs: number): boolean {
  if (watch.state !== 'active') {
    return false
  }
  if (watch.run.targetId === null) {
    return true
  }
  const lastCheck = lastCheckAtByWatch.get(watch.id) ?? 0
  return nowMs - lastCheck >= REMOTE_CHECK_MS && (remoteRetryAtByWatch.get(watch.id) ?? 0) <= nowMs
}

async function checkWatch(
  watch: ResearchRunWatch,
  links: readonly ResearchSlurmRunLink[],
  now: Date
): Promise<ResearchRunWatch> {
  const location = researchWatchLocation(watch)
  const remote = location.targetId !== null
  const result = await readResearchRunFiles(location, {
    metricsFrom: watch.metricsCursor.offset,
    logFrom: watch.logCursor.offset,
    maxBytes: remote ? REMOTE_READ_BYTES : LOCAL_READ_BYTES,
    manifestKnown: manifestByWatch.get(watch.id)?.stat ?? null
  })
  lastCheckAtByWatch.set(watch.id, now.getTime())
  if (!result.ok) {
    if (remote) {
      remoteRetryAtByWatch.set(watch.id, now.getTime() + REMOTE_FAILURE_BACKOFF_MS)
    }
    return { ...watch, lastError: result.message.slice(0, 500) }
  }
  remoteRetryAtByWatch.delete(watch.id)
  const manifest = manifestFacts(watch.id, result.read)
  return advanceResearchRunWatch(
    watch,
    result.read,
    manifest,
    latestSlurmLinkForRun(links, location),
    now.toISOString()
  )
}

let runtimeGetter: () => ResearchWatchRuntime | null = () => null
let tickTimer: ReturnType<typeof setInterval> | null = null
let running: Promise<void> | null = null
let rerun: Promise<void> | null = null

/** One pass at a time; a request during a pass gets one more pass after it, and awaits it. */
export function runResearchRunWatchPass(now?: Date): Promise<void> {
  if (running) {
    rerun ??= running.then(() => {
      rerun = null
      return runResearchRunWatchPass()
    })
    return rerun
  }
  const pass = watchPass(now ?? new Date()).finally(() => {
    if (running === pass) {
      running = null
    }
  })
  running = pass
  return pass
}

/** Due checks, then deliveries; persisted in one serialized update. */
async function watchPass(now: Date): Promise<void> {
  try {
    const document = await readResearchRunWatches()
    const due = document.watches.filter(
      (watch) => checkDue(watch, now.getTime()) || researchWatchNeedsDelivery(watch)
    )
    if (!due.length && !document.watches.some((watch) => watch.endedAt)) {
      return
    }
    const links = due.some((watch) => watch.state === 'active')
      ? ((await readResearchSlurmRunLinks().catch(() => null))?.links ?? [])
      : []
    const runtime = runtimeGetter()
    const patches = new Map<string, ResearchRunWatch>()
    for (const watch of due) {
      const checked = checkDue(watch, now.getTime())
        ? await checkWatch(withLiveProgress(watch), links, now)
        : watch
      const delivered = researchWatchNeedsDelivery(checked)
        ? await deliverResearchWatchEvents(runtime, checked, now)
        : checked
      progressAtByWatch.set(watch.id, delivered.lastProgressAt)
      if (worthSaving(delivered, watch)) {
        patches.set(watch.id, delivered)
      }
    }
    const retainAfter = now.getTime() - ENDED_RETENTION_MS
    const stale = (watch: ResearchRunWatch): boolean =>
      Boolean(
        watch.endedAt &&
        Date.parse(watch.endedAt) < retainAfter &&
        !researchWatchNeedsDelivery(watch)
      )
    if (!patches.size && !document.watches.some(stale)) {
      return
    }
    await updateResearchRunWatches((current) => ({
      ...current,
      watches: current.watches
        // A watch cancelled during this pass keeps its cancellation.
        .map((watch) => (watch.state === 'cancelled' ? watch : (patches.get(watch.id) ?? watch)))
        .filter((watch) => !stale(watch))
    }))
  } catch (error) {
    console.warn('[research-watch] pass failed', error)
  }
}

/** Starts the watcher; persisted watches resume after a restart. */
export function startResearchRunWatchService(getRuntime: () => ResearchWatchRuntime | null): void {
  runtimeGetter = getRuntime
  if (tickTimer) {
    return
  }
  tickTimer = setInterval(() => void runResearchRunWatchPass(), TICK_MS)
  tickTimer.unref?.()
  void runResearchRunWatchPass()
}

export function forgetResearchWatchCaches(watchId: string): void {
  manifestByWatch.delete(watchId)
  lastCheckAtByWatch.delete(watchId)
  remoteRetryAtByWatch.delete(watchId)
  progressAtByWatch.delete(watchId)
}
