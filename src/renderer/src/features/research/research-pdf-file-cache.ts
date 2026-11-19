/** What a cached copy must still match: the file's size and change times when it was read. */
export type PdfFileVersion = { size: number; mtime: number; ctime?: number }

export type StoredPdfFile = PdfFileVersion & { key: string; usedAt: number; bytes: Uint8Array }
export type StoredPdfFileMeta = { key: string; size: number; usedAt: number }

/** A durable home for whole PDFs (IndexedDB in the app); every call may fail and is optional. */
export type PdfFileStore = {
  get: (key: string) => Promise<StoredPdfFile | null>
  put: (entry: StoredPdfFile) => Promise<void>
  touch: (key: string, usedAt: number) => Promise<void>
  remove: (key: string) => Promise<void>
  list: () => Promise<StoredPdfFileMeta[]>
}

export type PdfFileCache = {
  /** The cached bytes when `version` still matches, else null. Callers must not mutate them. */
  get: (key: string, version: PdfFileVersion, persist: boolean) => Promise<Uint8Array | null>
  put: (key: string, version: PdfFileVersion, bytes: Uint8Array, persist: boolean) => Promise<void>
}

type MemoryEntry = PdfFileVersion & { bytes: Uint8Array }

export function samePdfFileVersion(left: PdfFileVersion, right: PdfFileVersion): boolean {
  return (
    left.size === right.size &&
    left.mtime === right.mtime &&
    (left.ctime ?? null) === (right.ctime ?? null)
  )
}

/**
 * Whole PDFs keyed by host, workspace and path, valid only while size and change times match.
 * Memory keeps the last few for instant switching; the store keeps remote files across restarts
 * (a local file is already on disk, so persisting it would only duplicate it).
 */
export function createPdfFileCache({
  memoryBudgetBytes,
  storeBudgetBytes,
  store,
  now = Date.now
}: {
  memoryBudgetBytes: number
  storeBudgetBytes: number
  store: PdfFileStore | null
  now?: () => number
}): PdfFileCache {
  const memory = new Map<string, MemoryEntry>()
  let memoryBytes = 0
  let pruning: Promise<void> = Promise.resolve()

  const forget = (key: string): void => {
    const entry = memory.get(key)
    if (entry) {
      memory.delete(key)
      memoryBytes -= entry.bytes.length
    }
  }
  const remember = (key: string, version: PdfFileVersion, bytes: Uint8Array): void => {
    forget(key)
    if (bytes.length > memoryBudgetBytes) {
      return
    }
    memory.set(key, { size: version.size, mtime: version.mtime, ctime: version.ctime, bytes })
    memoryBytes += bytes.length
    for (const [oldest] of memory) {
      if (memoryBytes <= memoryBudgetBytes) {
        break
      }
      forget(oldest)
    }
  }
  const prune = (): Promise<void> => {
    pruning = pruning.then(async () => {
      const entries = await store?.list()
      if (!entries) {
        return
      }
      let total = entries.reduce((sum, entry) => sum + entry.size, 0)
      for (const entry of entries.toSorted((left, right) => left.usedAt - right.usedAt)) {
        if (total <= storeBudgetBytes) {
          break
        }
        await store?.remove(entry.key)
        total -= entry.size
      }
    })
    return pruning.catch(() => {})
  }

  return {
    get: async (key, version, persist) => {
      const held = memory.get(key)
      if (held && samePdfFileVersion(held, version)) {
        // Map order is recency order.
        memory.delete(key)
        memory.set(key, held)
        return held.bytes
      }
      if (!persist || !store) {
        return null
      }
      try {
        const stored = await store.get(key)
        if (
          !stored ||
          !samePdfFileVersion(stored, version) ||
          stored.bytes.length !== version.size
        ) {
          return null
        }
        remember(key, version, stored.bytes)
        void store.touch(key, now()).catch(() => {})
        return stored.bytes
      } catch {
        return null
      }
    },
    put: async (key, version, bytes, persist) => {
      remember(key, version, bytes)
      if (!persist || !store || bytes.length > storeBudgetBytes) {
        return
      }
      try {
        await store.put({ key, ...version, usedAt: now(), bytes })
        await prune()
      } catch {
        // A full or unavailable store only costs the next open a download.
      }
    }
  }
}
