import { parseCcfddlConferenceYaml } from '../../shared/research/conference-deadline-ccfddl'
import {
  isConferenceYamlFileName,
  parseHuggingFaceConferenceYaml
} from '../../shared/research/conference-deadline-huggingface'
import { buildConferenceCatalog } from '../../shared/research/conference-deadline-merge'
import type {
  ConferenceCatalog,
  ConferenceEdition,
  ConferenceSource,
  ConferenceSourceSnapshot
} from '../../shared/research/conference-deadlines'
import {
  readConferenceCatalogCache,
  saveConferenceCatalogCache
} from './conference-deadlines-repository'

const HUGGING_FACE_LIST_URL =
  'https://api.github.com/repos/huggingface/ai-deadlines/contents/src/data/conferences?ref=main'
const HUGGING_FACE_RAW_URL =
  'https://raw.githubusercontent.com/huggingface/ai-deadlines/main/src/data/conferences/'
// Why: ccfddl publishes every conference as one generated file, so one request covers ~400 venues.
const CCFDDL_URL = 'https://ccfddl.github.io/conference/allconf.yml'
const FETCH_TIMEOUT_MS = 20_000
const MAX_SERIES_FILES = 300
const MAX_SERIES_FILE_CHARS = 512 * 1024
const MAX_COMBINED_FILE_CHARS = 8 * 1024 * 1024
const CONCURRENCY = 8

/** Electron's `net.fetch` on the desktop (system proxy), Node's `fetch` on a headless server. */
export type ConferenceCatalogFetch = (url: string, init: RequestInit) => Promise<Response>

let inFlight: Promise<ConferenceCatalog> | null = null

function oldestYearKept(): number {
  return new Date().getUTCFullYear() - 1
}

async function fetchText(
  fetchUrl: ConferenceCatalogFetch,
  url: string,
  accept: string,
  maxChars: number
): Promise<string> {
  const response = await fetchUrl(url, {
    headers: { Accept: accept },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  if (response.status === 403 || response.status === 429) {
    throw new Error('Rate limit reached. Try again in an hour.')
  }
  if (!response.ok) {
    throw new Error(`Conference data request failed (HTTP ${response.status}).`)
  }
  const body = await response.text()
  if (body.length > maxChars) {
    throw new Error('Conference data file is unexpectedly large.')
  }
  return body
}

async function fetchHuggingFace(fetchUrl: ConferenceCatalogFetch): Promise<ConferenceEdition[]> {
  const listing: unknown = JSON.parse(
    await fetchText(
      fetchUrl,
      HUGGING_FACE_LIST_URL,
      'application/vnd.github+json',
      MAX_SERIES_FILE_CHARS
    )
  )
  if (!Array.isArray(listing)) {
    throw new Error('Conference list has an unexpected format.')
  }
  const fileNames = listing
    .flatMap((entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      typeof entry.name === 'string' &&
      isConferenceYamlFileName(entry.name)
        ? [entry.name]
        : []
    )
    .slice(0, MAX_SERIES_FILES)
  const editions: ConferenceEdition[] = []
  let failures = 0
  let next = 0
  async function worker(): Promise<void> {
    while (next < fileNames.length) {
      const fileName = fileNames[next++]
      try {
        const source = await fetchText(
          fetchUrl,
          `${HUGGING_FACE_RAW_URL}${encodeURIComponent(fileName)}`,
          'text/plain',
          MAX_SERIES_FILE_CHARS
        )
        editions.push(...parseHuggingFaceConferenceYaml(source, oldestYearKept()))
      } catch {
        failures++
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  // Why: a partial download would silently drop conferences, so keep the previous copy instead.
  if (failures > 0) {
    throw new Error(`${failures} conference files could not be downloaded.`)
  }
  return editions
}

async function fetchCcfddl(fetchUrl: ConferenceCatalogFetch): Promise<ConferenceEdition[]> {
  const source = await fetchText(fetchUrl, CCFDDL_URL, 'text/yaml', MAX_COMBINED_FILE_CHARS)
  const editions = parseCcfddlConferenceYaml(source, oldestYearKept())
  if (editions.length === 0) {
    throw new Error('ccfddl data has an unexpected format.')
  }
  return editions
}

const FETCHERS: Record<
  ConferenceSource,
  (fetchUrl: ConferenceCatalogFetch) => Promise<ConferenceEdition[]>
> = {
  huggingface: fetchHuggingFace,
  ccfddl: fetchCcfddl
}

async function refresh(fetchUrl: ConferenceCatalogFetch): Promise<ConferenceCatalog> {
  const previous = await readConferenceCatalogCache()
  const sources = Object.keys(FETCHERS).filter(
    (source): source is ConferenceSource => source === 'huggingface' || source === 'ccfddl'
  )
  const results = await Promise.allSettled(sources.map((source) => FETCHERS[source](fetchUrl)))
  const failed: ConferenceSource[] = []
  const snapshots: ConferenceSourceSnapshot[] = []
  results.forEach((result, index) => {
    const source = sources[index]
    if (result.status === 'fulfilled') {
      snapshots.push({
        source,
        fetchedAt: new Date().toISOString(),
        editions: result.value.slice(0, 5000)
      })
      return
    }
    failed.push(source)
    const kept = previous?.snapshots.find((snapshot) => snapshot.source === source)
    if (kept) {
      snapshots.push(kept)
    }
  })
  if (snapshots.length === 0) {
    throw new Error('No conference data could be downloaded. Check your connection.')
  }
  const saved = await saveConferenceCatalogCache({ schemaVersion: 2, snapshots })
  return buildConferenceCatalog(saved, failed)
}

/** One download at a time per process, whichever fetch started it. */
export function refreshConferenceCatalog(
  fetchUrl: ConferenceCatalogFetch = fetch
): Promise<ConferenceCatalog> {
  inFlight ??= refresh(fetchUrl).finally(() => {
    inFlight = null
  })
  return inFlight
}

export async function readConferenceCatalog(): Promise<ConferenceCatalog | null> {
  const cache = await readConferenceCatalogCache()
  return cache ? buildConferenceCatalog(cache) : null
}
