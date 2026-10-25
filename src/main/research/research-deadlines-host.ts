import type { z } from 'zod'
import {
  suggestConferenceSeries,
  upcomingConferenceDeadlines
} from '../../shared/research/conference-deadline-upcoming'
import {
  conferenceSeriesKey,
  type ConferenceCatalog,
  type ConferenceTracking
} from '../../shared/research/conference-deadlines'
import {
  RESEARCH_DEADLINES_API_VERSION,
  type ResearchDeadlinesReadParams,
  type ResearchDeadlinesReadResult,
  type ResearchDeadlinesUpdateOp,
  type ResearchDeadlinesUpdateParams,
  type ResearchDeadlinesUpdateResult
} from '../../shared/research/research-deadlines-api'
import {
  readConferenceCatalog,
  refreshConferenceCatalog
} from './conference-deadlines-catalog-fetch'
import { readConferenceTracking, updateConferenceTracking } from './conference-deadlines-repository'

// Calls for papers change rarely; a day keeps a phone's reads from downloading on every open.
const CATALOG_STALE_MS = 24 * 60 * 60 * 1000
const MAX_UPCOMING = 100
const MAX_SUGGESTIONS = 8

let refreshing: Promise<ConferenceCatalog | null> | null = null
let lastRefreshError: string | null = null

/** Downloads the public catalogs into this host's data root; never rejects. */
function startCatalogRefresh(): Promise<ConferenceCatalog | null> {
  refreshing ??= refreshConferenceCatalog()
    .then(
      (catalog) => {
        lastRefreshError = null
        return catalog
      },
      (error: unknown) => {
        lastRefreshError = error instanceof Error ? error.message : String(error)
        return null
      }
    )
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function isStale(catalog: ConferenceCatalog | null, now: number): boolean {
  return !catalog || now - Date.parse(catalog.fetchedAt) > CATALOG_STALE_MS
}

function deadlinesResult(
  tracking: ConferenceTracking,
  catalog: ConferenceCatalog | null
): ResearchDeadlinesReadResult {
  const now = Date.now()
  const upcoming = upcomingConferenceDeadlines(catalog, tracking, now)
  const nothingTracked =
    tracking.trackedSeries.length === 0 &&
    tracking.submissions.length === 0 &&
    tracking.customDeadlines.length === 0
  return {
    version: RESEARCH_DEADLINES_API_VERSION,
    revision: tracking.revision ?? 0,
    trackedSeries: tracking.trackedSeries,
    upcoming: upcoming.slice(0, MAX_UPCOMING),
    omitted: Math.max(0, upcoming.length - MAX_UPCOMING),
    suggestions: nothingTracked ? suggestConferenceSeries(catalog, now, MAX_SUGGESTIONS) : [],
    catalog: {
      status: catalog ? 'present' : 'absent',
      fetchedAt: catalog?.fetchedAt ?? null,
      sources: catalog?.sources ?? [],
      stale: isStale(catalog, now),
      refreshing: refreshing !== null,
      lastError: lastRefreshError
    },
    readAt: new Date(now).toISOString()
  }
}

/** This host's tracked deadlines; a stale or missing catalog starts a download behind the reply. */
export async function readResearchDeadlines(
  params: z.infer<typeof ResearchDeadlinesReadParams>
): Promise<ResearchDeadlinesReadResult> {
  const tracking = await readConferenceTracking()
  let catalog = await readConferenceCatalog()
  if (params.refresh) {
    catalog = (await startCatalogRefresh()) ?? catalog
  } else if (isStale(catalog, Date.now())) {
    void startCatalogRefresh()
  }
  return deadlinesResult(tracking, catalog)
}

function applyDeadlineOps(
  current: ConferenceTracking,
  ops: readonly ResearchDeadlinesUpdateOp[],
  now: string
): ConferenceTracking {
  let next = current
  for (const op of ops) {
    if (op.op === 'setSubmission') {
      const existing = next.submissions.find((entry) => entry.editionId === op.editionId)
      const others = next.submissions.filter((entry) => entry.editionId !== op.editionId)
      const project = op.project === undefined ? existing?.project : (op.project ?? undefined)
      const updated = op.status
        ? [
            {
              editionId: op.editionId,
              status: op.status,
              updatedAt: now,
              ...(project ? { project } : {})
            }
          ]
        : []
      next = { ...next, submissions: [...others, ...updated] }
      continue
    }
    // Why the key: the catalog names series `icml`; a phone may send `ICML`.
    const series = conferenceSeriesKey(op.series)
    if (!series) {
      throw new Error(`Not a conference series: ${op.series}`)
    }
    const tracked = next.trackedSeries.includes(series)
    if (op.op === 'track' && !tracked) {
      next = { ...next, trackedSeries: [...next.trackedSeries, series] }
    } else if (op.op === 'untrack' && tracked) {
      next = { ...next, trackedSeries: next.trackedSeries.filter((entry) => entry !== series) }
    }
  }
  return next
}

class StaleDeadlinesRevision extends Error {}

/** Applies `ops` only when the document is still at `revision`; otherwise reports the conflict. */
export async function updateResearchDeadlines(
  params: z.infer<typeof ResearchDeadlinesUpdateParams>
): Promise<ResearchDeadlinesUpdateResult> {
  let status: ResearchDeadlinesUpdateResult['status'] = 'saved'
  let tracking: ConferenceTracking
  try {
    tracking = await updateConferenceTracking((current) => {
      if ((current.revision ?? 0) !== params.revision) {
        throw new StaleDeadlinesRevision()
      }
      return applyDeadlineOps(current, params.ops, new Date().toISOString())
    })
  } catch (error) {
    if (!(error instanceof StaleDeadlinesRevision)) {
      throw error
    }
    status = 'conflict'
    tracking = await readConferenceTracking()
  }
  return {
    version: RESEARCH_DEADLINES_API_VERSION,
    status,
    deadlines: deadlinesResult(tracking, await readConferenceCatalog())
  }
}
