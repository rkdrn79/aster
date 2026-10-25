import { randomBytes } from 'node:crypto'
import type { z } from 'zod'
import type {
  ResearchRunWatchCreated,
  ResearchRunWatchSummary
} from '../../shared/research/research-run-agent-status'
import {
  formatResearchRunName,
  parseResearchRunName
} from '../../shared/research/research-run-reference'
import type { ResearchRunWatch, ResearchWatchOwner } from '../../shared/research/research-run-watch'
import {
  formatResearchWatchCondition,
  parseResearchWatchConditions
} from '../../shared/research/research-run-watch-conditions'
import type {
  ResearchRunWatchCancelParams,
  ResearchRunWatchListParams,
  ResearchRunWatchParams
} from '../../shared/rpc-contract/research-run-params'
import { readResearchRunFiles } from './research-run-files'
import { researchRunDir, resolveResearchRun } from './research-run-resolve'
import { readResearchRunWatches, updateResearchRunWatches } from './research-run-watch-store'
import {
  forgetResearchWatchCaches,
  researchWatchLastCheckedAt,
  runResearchRunWatchPass
} from './research-run-watch-service'

const MAX_ACTIVE_WATCHES = 200

function ownerLabel(owner: ResearchWatchOwner | null): string | null {
  if (!owner) {
    return null
  }
  if (owner.agentSessionId) {
    return `chat ${owner.agentSessionId}`
  }
  return owner.terminalHandle
    ? `terminal ${owner.terminalHandle}`
    : owner.paneKey
      ? `pane ${owner.paneKey}`
      : null
}

export function summarizeResearchRunWatch(watch: ResearchRunWatch): ResearchRunWatchSummary {
  return {
    id: watch.id,
    run: formatResearchRunName(watch.run),
    targetId: watch.run.targetId,
    host: watch.run.hostLabel ?? (watch.run.targetId ? watch.run.targetId : 'local'),
    projectPath: watch.run.projectPath,
    conditions: watch.conditions,
    notify: watch.notify,
    owner: ownerLabel(watch.owner),
    message: watch.message,
    state: watch.state,
    createdAt: watch.createdAt,
    endedAt: watch.endedAt,
    lastCheckedAt: researchWatchLastCheckedAt(watch.id),
    lastError: watch.lastError,
    fired: watch.fired.map(({ condition, implicit, firedAt, evidence, delivery }) => ({
      condition,
      implicit,
      firedAt,
      evidence,
      delivery
    }))
  }
}

function ownerFrom(params: z.infer<typeof ResearchRunWatchParams>): ResearchWatchOwner | null {
  const owner: ResearchWatchOwner = {
    terminalHandle: params.owner?.terminalHandle ?? null,
    paneKey: params.owner?.paneKey ?? null,
    agentSessionId: params.owner?.agentSessionId ?? null
  }
  return owner.terminalHandle || owner.paneKey || owner.agentSessionId ? owner : null
}

export async function createResearchRunWatch(
  params: z.infer<typeof ResearchRunWatchParams>
): Promise<ResearchRunWatchCreated> {
  const conditions = parseResearchWatchConditions(params.on).map(formatResearchWatchCondition)
  const { location, hostLabel } = await resolveResearchRun(params)
  const read = await readResearchRunFiles(location, {
    metricsFrom: 'tail',
    logFrom: 'tail',
    maxBytes: 0,
    statOnly: true
  })
  if (!read.ok) {
    throw new Error(`Could not read the Run: ${read.message}`)
  }
  if (!read.read.manifest) {
    throw new Error(
      `No run.json in ${researchRunDir(location, read.read.recordRoot)}. Check --run and --project.`
    )
  }
  const notify = params.notify ?? 'self'
  const owner = notify === 'self' ? ownerFrom(params) : null
  const warnings: string[] = []
  if (notify === 'self' && !owner) {
    warnings.push(
      'This shell has no Aster terminal or chat identity, so no agent will be woken; a desktop notification is still sent.'
    )
  }
  const now = new Date().toISOString()
  const metricsSize = read.read.metrics.stat?.size ?? 0
  const logStat = read.read.log.stat
  const watch: ResearchRunWatch = {
    id: `w-${randomBytes(5).toString('hex')}`,
    createdAt: now,
    run: { ...location, hostLabel },
    conditions,
    notify,
    message: params.message?.trim() || null,
    owner,
    state: 'active',
    endedAt: null,
    // Metric history counts (a threshold already met fires at once); log matches only new lines.
    metricsCursor: {
      offset: Math.max(0, metricsSize - 4 * 1024 * 1024),
      size: read.read.metrics.stat?.size ?? null,
      mtimeMs: read.read.metrics.stat?.mtimeMs ?? null
    },
    logCursor: {
      offset: logStat?.size ?? 0,
      size: logStat?.size ?? null,
      mtimeMs: logStat?.mtimeMs ?? null
    },
    lastProgressAt: now,
    lastCheckedAt: null,
    lastError: null,
    lastMetrics: null,
    runState: null,
    fired: []
  }
  await updateResearchRunWatches((document) => {
    if (document.watches.filter((entry) => entry.state === 'active').length >= MAX_ACTIVE_WATCHES) {
      throw new Error(`There are already ${MAX_ACTIVE_WATCHES} active watches. Cancel some first.`)
    }
    return { ...document, watches: [...document.watches, watch] }
  })
  void runResearchRunWatchPass()
  return { watch: summarizeResearchRunWatch(watch), warnings }
}

export async function listResearchRunWatches(
  params: z.infer<typeof ResearchRunWatchListParams>
): Promise<{ watches: ResearchRunWatchSummary[] }> {
  const name = params.run ? parseResearchRunName(params.run) : null
  const document = await readResearchRunWatches()
  return {
    watches: document.watches
      .filter((watch) => params.all || watch.state === 'active')
      .filter(
        (watch) =>
          !name || (watch.run.experiment === name.experiment && watch.run.runId === name.runId)
      )
      .map(summarizeResearchRunWatch)
  }
}

export async function cancelResearchRunWatch(
  params: z.infer<typeof ResearchRunWatchCancelParams>
): Promise<{ watch: ResearchRunWatchSummary }> {
  const found: { watch: ResearchRunWatch | null } = { watch: null }
  await updateResearchRunWatches((document) => ({
    ...document,
    watches: document.watches.map((watch) => {
      if (watch.id !== params.id) {
        return watch
      }
      found.watch =
        watch.state === 'active'
          ? { ...watch, state: 'cancelled', endedAt: new Date().toISOString() }
          : watch
      return found.watch
    })
  }))
  if (!found.watch) {
    throw new Error(`No watch ${params.id}. List them with: research watch list --all`)
  }
  forgetResearchWatchCaches(params.id)
  return { watch: summarizeResearchRunWatch(found.watch) }
}
