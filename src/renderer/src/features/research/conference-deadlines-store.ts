import { create } from 'zustand'
import type {
  ConferenceCatalog,
  ConferenceTracking
} from '../../../../shared/research/conference-deadlines'

const CATALOG_STALE_MS = 12 * 60 * 60 * 1000

type ConferenceDeadlinesState = {
  tracking: ConferenceTracking | null
  catalog: ConferenceCatalog | null
  loading: boolean
  refreshing: boolean
  error: string | null
  refreshError: string | null
  /** True when this window's preload predates conference deadlines and needs an app restart. */
  needsRestart: boolean
  load: () => Promise<void>
  refresh: () => Promise<void>
  /** Downloads the list again only when the cached copy is missing or old. */
  refreshIfStale: () => Promise<void>
  update: (change: (tracking: ConferenceTracking) => ConferenceTracking) => Promise<void>
}

let loadPromise: Promise<void> | null = null
let saveQueue: Promise<void> = Promise.resolve()

// Why: dev windows hot-reload this code over an older main process, whose replies lack newer fields.
function isFromOlderMainProcess(
  tracking: ConferenceTracking | null,
  catalog: ConferenceCatalog | null
): boolean {
  return (
    (tracking !== null && !Array.isArray(tracking.submissions)) ||
    (catalog !== null && !Array.isArray(catalog.sources))
  )
}

function isStale(catalog: ConferenceCatalog | null): boolean {
  const fetchedAt = catalog ? Date.parse(catalog.fetchedAt) : Number.NaN
  return !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CATALOG_STALE_MS
}

export const useConferenceDeadlines = create<ConferenceDeadlinesState>((set, get) => ({
  tracking: null,
  catalog: null,
  loading: false,
  refreshing: false,
  error: null,
  refreshError: null,
  needsRestart: false,
  load: () => {
    if (get().tracking) {
      return Promise.resolve()
    }
    const api = window.api.conferenceDeadlines
    if (!api?.readTracking) {
      set({ needsRestart: true })
      return Promise.resolve()
    }
    loadPromise ??= Promise.all([api.readTracking(), api.readCatalog()])
      .then(([tracking, catalog]) =>
        isFromOlderMainProcess(tracking, catalog)
          ? set({ needsRestart: true })
          : set({ tracking, catalog, error: null })
      )
      .catch((cause: unknown) => set({ error: String(cause) }))
      .finally(() => {
        set({ loading: false })
        loadPromise = null
      })
    set({ loading: true })
    return loadPromise
  },
  refresh: async () => {
    if (get().refreshing || get().needsRestart || !window.api.conferenceDeadlines?.refreshCatalog) {
      return
    }
    set({ refreshing: true, refreshError: null })
    try {
      const catalog = await window.api.conferenceDeadlines.refreshCatalog()
      set(
        isFromOlderMainProcess(null, catalog) ? { needsRestart: true, catalog: null } : { catalog }
      )
    } catch (cause) {
      set({ refreshError: `Conference list was not updated. ${String(cause)}` })
    } finally {
      set({ refreshing: false })
    }
  },
  refreshIfStale: async () => {
    await get().load()
    if (isStale(get().catalog)) {
      await get().refresh()
    }
  },
  update: (change) => {
    const pending = saveQueue.then(async () => {
      if (!get().tracking) {
        await get().load()
      }
      const current = get().tracking
      if (!current) {
        throw new Error('Tracked deadlines could not be loaded')
      }
      try {
        set({ tracking: await window.api.conferenceDeadlines.saveTracking(change(current)) })
        set({ error: null })
      } catch (cause) {
        set({ error: `Changes are not saved. ${String(cause)}` })
        throw cause
      }
    })
    saveQueue = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }
}))
