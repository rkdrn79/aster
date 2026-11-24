import { randomBytes } from 'node:crypto'
import { constants, existsSync } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { hostname } from 'node:os'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import {
  researchRunRecordedElsewhere,
  type ResearchRunHostFacts,
  type ResearchRunHostObservation,
  type ResearchRunHostQuery,
  type ResearchRunLogState
} from '../../shared/research/research-run-host'
import { isENOENT } from '../ipc/filesystem-path-containment'
import { runResearchComputeCommand } from './research-compute-transport'
import { adoptHarnessSlurmJobs, type HarnessSlurmJobCandidate } from './research-slurm-run-adopt'
import { runHostBits } from './research-run-host-paths'

const READ_TIMEOUT_MS = 30_000
const MANIFEST_HEAD_BYTES = 32 * 1024

type RunRead = {
  manifestPath: string
  manifest: string | null
  log: { state: ResearchRunLogState; reason: string | null }
}

async function localLog(logPath: string | null): Promise<RunRead['log']> {
  if (!logPath) {
    return { state: 'missing', reason: null }
  }
  try {
    const info = await stat(logPath)
    await access(logPath, constants.R_OK)
    return { state: info.size > 0 ? 'present' : 'empty', reason: null }
  } catch (error) {
    return isENOENT(error)
      ? { state: 'missing', reason: null }
      : { state: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
  }
}

async function readLocal(query: ResearchRunHostQuery): Promise<RunRead[]> {
  return Promise.all(
    query.runs.map(async (run) => ({
      manifestPath: run.manifestPath,
      manifest: await readFile(run.manifestPath, 'utf8')
        .then((content) => content.slice(0, MANIFEST_HEAD_BYTES))
        .catch(() => null),
      log: await localLog(run.logPath)
    }))
  )
}

/** One exec: this host's name, each run.json's head, and each log's size or why it is absent. */
export function buildRunHostReadCommand(runs: ResearchRunHostQuery['runs'], nonce: string): string {
  const mark = `@@aster-${nonce}`
  const parts = [`printf '${mark}-host\\t%s\\n' "$(hostname 2>/dev/null || uname -n)"`]
  runs.forEach((run, index) => {
    const manifest = quotePosixShell(run.manifestPath)
    parts.push(
      `printf '${mark}-run\\t${index}\\n'; head -c ${MANIFEST_HEAD_BYTES} ${manifest} 2>/dev/null; printf '\\n${mark}-end\\n'`
    )
    if (run.logPath) {
      const log = quotePosixShell(run.logPath)
      // Why spell each case: `2>/dev/null` would read a missing and an unreadable log as empty.
      parts.push(
        `if [ ! -e ${log} ]; then s=missing; elif [ ! -r ${log} ]; then s=unreadable; else s=$(wc -c < ${log} | tr -d ' '); fi; printf '${mark}-log\\t${index}\\t%s\\n' "$s"`
      )
    }
  })
  return parts.join('; ')
}

export function parseRunHostRead(
  stdout: string,
  runs: ResearchRunHostQuery['runs'],
  nonce: string
): { thisHost: string | null; reads: RunRead[] } {
  const mark = `@@aster-${nonce}`
  const host = new RegExp(`^${mark}-host\\t(.+)$`, 'm').exec(stdout)?.[1]?.trim() || null
  const manifests = new Map<number, string>()
  for (const match of stdout.matchAll(
    new RegExp(`^${mark}-run\\t(\\d+)\\n([\\s\\S]*?)\\n${mark}-end$`, 'gm')
  )) {
    manifests.set(Number(match[1]), match[2])
  }
  const logs = new Map<number, string>()
  for (const match of stdout.matchAll(new RegExp(`^${mark}-log\\t(\\d+)\\t(\\S*)$`, 'gm'))) {
    logs.set(Number(match[1]), match[2])
  }
  return {
    thisHost: host,
    reads: runs.map((run, index) => {
      const raw = logs.get(index)
      const size = Number(raw)
      const log: RunRead['log'] =
        raw === 'unreadable'
          ? { state: 'unreadable', reason: 'permission denied' }
          : raw === undefined || raw === 'missing' || !Number.isFinite(size)
            ? { state: 'missing', reason: null }
            : { state: size > 0 ? 'present' : 'empty', reason: null }
      return { manifestPath: run.manifestPath, manifest: manifests.get(index) || null, log }
    })
  }
}

async function remoteCwdsHere(targetId: string, cwds: readonly string[]): Promise<Set<string>> {
  if (!cwds.length) {
    return new Set()
  }
  const nonce = randomBytes(6).toString('hex')
  const command = cwds
    .map((cwd, index) => `[ -d ${quotePosixShell(cwd)} ] && printf '@@${nonce}\\t${index}\\n'`)
    .concat('true')
    .join('; ')
  const result = await runResearchComputeCommand(targetId, false, command, READ_TIMEOUT_MS)
  if (result.status !== 'ok') {
    // Why all: unanswered is not "missing"; a Run is foreign only on evidence.
    return new Set(cwds)
  }
  const here = new Set<string>()
  for (const match of result.stdout.matchAll(new RegExp(`^@@${nonce}\\t(\\d+)$`, 'gm'))) {
    const cwd = cwds[Number(match[1])]
    if (cwd) {
      here.add(cwd)
    }
  }
  return here
}

/**
 * Which of a project's Runs this host can observe, and how their logs stand. A Run another host
 * recorded whose folder is not here (records copied from another cluster) is never polled as live.
 */
export async function observeResearchRunHosts(
  query: ResearchRunHostQuery
): Promise<ResearchRunHostObservation> {
  let thisHost: string | null
  let reads: RunRead[]
  let cwdHere: (cwd: string) => boolean
  if (query.targetId === null) {
    thisHost = hostname()
    reads = await readLocal(query)
    cwdHere = (cwd) => existsSync(cwd)
  } else {
    const nonce = randomBytes(6).toString('hex')
    const result = await runResearchComputeCommand(
      query.targetId,
      false,
      buildRunHostReadCommand(query.runs, nonce),
      READ_TIMEOUT_MS
    )
    if (result.status !== 'ok') {
      throw new Error(result.status === 'error' ? result.message : 'The host is not connected.')
    }
    ;({ thisHost, reads } = parseRunHostRead(result.stdout, query.runs, nonce))
    const bits = reads.map((read) => runHostBits(read.manifest))
    const elsewhere = [
      ...new Set(
        bits.flatMap((item) =>
          item?.cwd && item.launchHost && item.launchHost !== thisHost ? [item.cwd] : []
        )
      )
    ]
    const here = await remoteCwdsHere(query.targetId, elsewhere)
    cwdHere = (cwd) => here.has(cwd)
  }
  const runs: Record<string, ResearchRunHostFacts> = {}
  const candidates: HarnessSlurmJobCandidate[] = []
  for (const read of reads) {
    const bits = runHostBits(read.manifest)
    if (!bits) {
      continue
    }
    const recordedOn = researchRunRecordedElsewhere(
      { host: bits.launchHost, cwd: bits.cwd },
      thisHost,
      cwdHere
    )
    runs[read.manifestPath] = {
      launchHost: bits.launchHost,
      recordedOn,
      log: read.log,
      job: bits.job ? { jobId: bits.job.jobId, tracked: false } : null
    }
    if (bits.job?.recordedByHarness && bits.running && !recordedOn) {
      candidates.push({ manifestPath: read.manifestPath, jobId: bits.job.jobId })
    }
  }
  if (query.targetId !== null) {
    const tracked = await adoptHarnessSlurmJobs(query.targetId, candidates)
    for (const [manifestPath, jobId] of tracked) {
      const facts = runs[manifestPath]
      if (facts?.job?.jobId === jobId) {
        facts.job = { jobId, tracked: true }
      }
    }
  }
  return { thisHost, runs }
}
