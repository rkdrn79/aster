import {
  applyResearchJobToManifest,
  parseManifestObject,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import {
  buildSlurmJobTrackingCommand,
  isTerminalResearchJobState,
  parseSlurmJobTrackingOutput,
  researchExecutionFromJob,
  type ResearchSlurmJobObservation
} from '../../shared/research/research-slurm-accounting'
import {
  emptyResearchSlurmRunLinksDocument,
  researchSlurmRunLinksDocumentSchema,
  type ResearchSlurmRunLink
} from '../../shared/research/research-slurm-run-links'
import { knownSshHostPlatform } from '../ssh/ssh-host-platform-memo'
import { runResearchComputeCommand } from './research-compute-transport'
import { createResearchJsonDocumentStore } from './research-json-document-store'
import { readResearchRunFiles, writeResearchRunManifest } from './research-run-files'

const TRACK_TIMEOUT_MS = 30_000
const FAILED_READ_BACKOFF_MS = 5 * 60_000
const CLOSED_RETENTION_MS = 30 * 24 * 60 * 60_000
/** A job never seen to end (purged from accounting, or another cluster) stops being polled. */
const GIVE_UP_MS = 14 * 24 * 60 * 60_000
const MAX_LINKS = 2000

const linksStore = createResearchJsonDocumentStore({
  fileName: 'slurm-run-links.json',
  schema: researchSlurmRunLinksDocumentSchema,
  empty: emptyResearchSlurmRunLinksDocument,
  label: 'Linked SLURM jobs'
})

export const readResearchSlurmRunLinks = linksStore.read

export function slurmRunLinkLocation(link: ResearchSlurmRunLink): ResearchRunLocation {
  return {
    targetId: link.targetId,
    projectPath: link.projectPath,
    experiment: link.experiment,
    runId: link.runId,
    ...(link.recordRoot ? { recordRoot: link.recordRoot } : {})
  }
}

function sameLink(a: ResearchSlurmRunLink, b: ResearchSlurmRunLink): boolean {
  return a.targetId === b.targetId && a.jobId === b.jobId
}

/** The newest job per Run wins: a resubmission supersedes the attempt before it. */
export function latestSlurmLinkForRun(
  links: readonly ResearchSlurmRunLink[],
  location: ResearchRunLocation
): ResearchSlurmRunLink | null {
  return (
    links
      .filter(
        (link) =>
          link.targetId === location.targetId &&
          link.projectPath === location.projectPath &&
          link.experiment === location.experiment &&
          link.runId === location.runId
      )
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] ?? null
  )
}

/**
 * Writes the job's state into run.json. Run.json written by a launcher that saw the process exit
 * keeps its execution; the job block is always Aster's latest observation.
 */
export async function writeSlurmJobIntoManifest(
  link: ResearchSlurmRunLink
): Promise<{ ok: true; executionWritten: boolean } | { ok: false; message: string }> {
  const location = slurmRunLinkLocation(link)
  const read = await readResearchRunFiles(location, {
    metricsFrom: 'tail',
    logFrom: 'tail',
    maxBytes: 0,
    statOnly: true
  })
  if (!read.ok) {
    return read
  }
  const manifest = read.read.manifest
  if (!manifest?.content) {
    return { ok: false, message: 'run.json is missing or larger than 256 KB.' }
  }
  let current: Record<string, unknown>
  try {
    current = parseManifestObject(manifest.content)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  const updated = applyResearchJobToManifest(
    current,
    {
      scheduler: 'slurm',
      jobId: link.jobId,
      host: link.hostLabel ?? link.targetId,
      submittedAt: link.submittedAt,
      state: link.state,
      observedAt: link.observedAt,
      reason: link.reason,
      exitCode: link.exitCode
    },
    researchExecutionFromJob(link.state, link.exitCode)
  )
  const written = await writeResearchRunManifest(
    location,
    `${JSON.stringify(updated.manifest, null, 2)}\n`,
    manifest.stat
  )
  return written.ok ? { ok: true, executionWritten: updated.executionWritten } : written
}

export async function recordResearchSlurmRunLink(
  link: ResearchSlurmRunLink
): Promise<ResearchSlurmRunLink> {
  const written = await writeSlurmJobIntoManifest(link)
  const recorded: ResearchSlurmRunLink = {
    ...link,
    manifestState: written.ok ? link.state : null,
    manifestMessage: written.ok ? null : written.message.slice(0, 500)
  }
  await linksStore.update((document) => ({
    ...document,
    links: [...document.links.filter((entry) => !sameLink(entry, recorded)), recorded].slice(
      -MAX_LINKS
    )
  }))
  return recorded
}

/** The link after one observation; null observation means the job was not listed. */
export function observeSlurmRunLink(
  link: ResearchSlurmRunLink,
  observation: ResearchSlurmJobObservation | null,
  accounting: boolean,
  now: string
): ResearchSlurmRunLink {
  if (observation) {
    return {
      ...link,
      state: observation.state,
      reason: observation.reason,
      exitCode: observation.exitCode,
      observedAt: now
    }
  }
  if (!accounting && link.state !== 'unknown') {
    // Without accounting the queue is the only witness, and it forgets a job once it ends.
    return {
      ...link,
      state: 'unknown',
      reason: 'left the queue; SLURM accounting is unavailable, so how it ended is unknown',
      observedAt: now
    }
  }
  return link
}

function shouldClose(link: ResearchSlurmRunLink, nowMs: number): boolean {
  const ended = isTerminalResearchJobState(link.state) || link.state === 'unknown'
  return (
    (ended && link.manifestState === link.state) ||
    Date.parse(link.submittedAt) + GIVE_UP_MS < nowMs
  )
}

const nextReadAtByHost = new Map<string, number>()
let tracking = false

/** One sacct (plus squeue) per host with open links, then run.json updates for what changed. */
export async function trackLinkedResearchSlurmJobs(now = new Date()): Promise<void> {
  if (tracking) {
    return
  }
  tracking = true
  try {
    const document = await linksStore.read()
    const open = document.links.filter((link) => !link.closedAt)
    const byHost = new Map<string, ResearchSlurmRunLink[]>()
    for (const link of open) {
      byHost.set(link.targetId, [...(byHost.get(link.targetId) ?? []), link])
    }
    const updates: ResearchSlurmRunLink[] = []
    for (const [targetId, links] of byHost) {
      if ((nextReadAtByHost.get(targetId) ?? 0) > now.getTime()) {
        continue
      }
      if (knownSshHostPlatform(targetId)?.os === 'win32') {
        continue
      }
      // Why dial: linking a Run at submit is the consent to read that job's state later.
      const result = await runResearchComputeCommand(
        targetId,
        true,
        buildSlurmJobTrackingCommand(links.map((link) => link.jobId)),
        TRACK_TIMEOUT_MS
      )
      if (result.status !== 'ok') {
        nextReadAtByHost.set(targetId, now.getTime() + FAILED_READ_BACKOFF_MS)
        continue
      }
      nextReadAtByHost.delete(targetId)
      const read = parseSlurmJobTrackingOutput(result.stdout)
      for (const link of links) {
        const observed = observeSlurmRunLink(
          link,
          read.jobs.get(link.jobId) ?? null,
          read.accounting,
          now.toISOString()
        )
        let next = observed
        if (observed.manifestState !== observed.state) {
          const written = await writeSlurmJobIntoManifest(observed)
          next = {
            ...observed,
            manifestState: written.ok ? observed.state : observed.manifestState,
            manifestMessage: written.ok ? null : written.message.slice(0, 500)
          }
        }
        if (shouldClose(next, now.getTime())) {
          next = { ...next, closedAt: now.toISOString() }
        }
        if (JSON.stringify(next) !== JSON.stringify(link)) {
          updates.push(next)
        }
      }
    }
    const retainAfter = now.getTime() - CLOSED_RETENTION_MS
    const expired = document.links.some(
      (link) => link.closedAt && Date.parse(link.closedAt) <= retainAfter
    )
    if (!updates.length && !expired) {
      return
    }
    await linksStore.update((current) => ({
      ...current,
      links: current.links
        .map((link) => updates.find((entry) => sameLink(entry, link)) ?? link)
        .filter((link) => !link.closedAt || Date.parse(link.closedAt) > retainAfter)
    }))
  } catch (error) {
    console.warn('[research-slurm] linked job tracking failed', error)
  } finally {
    tracking = false
  }
}
