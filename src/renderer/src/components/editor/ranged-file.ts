/** Reads `length` bytes at `offset`; must return exactly that many bytes. */
export type RangedFileBlockReader = (offset: number, length: number) => Promise<Uint8Array>

export type RangedFileProgress = { loaded: number; total: number }

/**
 * A file read block by block over a slow link: requested ranges jump the queue, and a background
 * fill fetches the rest in order, a few blocks at a time, so the first page shows long before the
 * last byte arrives.
 */
export type RangedFile = {
  readonly size: number
  readonly blockBytes: number
  /** A copy of bytes [begin, end) once every block they touch has arrived. */
  read: (begin: number, end: number) => Promise<Uint8Array<ArrayBuffer>>
  /** Starts (or resumes) fetching every missing block, lowest offset first. */
  fillInBackground: () => void
  /** Stops dispatching background blocks; requested ranges still load. */
  pauseBackground: () => void
  /** The whole file once every block has arrived. */
  readonly complete: Promise<Uint8Array<ArrayBuffer>>
  /** Length of the loaded prefix [0, n). */
  contiguousBytes: () => number
  /** A copy of loaded bytes [begin, end); the caller has checked they are loaded. */
  copyLoaded: (begin: number, end: number) => Uint8Array<ArrayBuffer>
  loadedBytes: () => number
  isComplete: () => boolean
  onProgress: (listener: (progress: RangedFileProgress) => void) => () => void
  abort: (reason?: unknown) => void
}

const MISSING = 0
const IN_FLIGHT = 1
const LOADED = 2
const READ_ATTEMPTS = 2

export class RangedFileChangedError extends Error {
  constructor() {
    super('The file changed while it was loading. Reload to see the latest version.')
    this.name = 'RangedFileChangedError'
  }
}

/** The read was dropped (superseded or parked); whoever still shows it is about to be replaced. */
export class RangedFileAbortedError extends Error {
  constructor() {
    super('Ranged read aborted')
    this.name = 'RangedFileAbortedError'
  }
}

/**
 * `blockBytes` is the grid ranges are tracked and requested in; one read covers up to
 * `maxReadBytes` of adjacent missing blocks. A small grid keeps a scattered font or page object
 * from costing a whole large read; coalescing keeps the background fill at full-size reads.
 */
export function createRangedFile({
  size,
  blockBytes,
  maxReadBytes = blockBytes,
  concurrency,
  readBlock
}: {
  size: number
  blockBytes: number
  maxReadBytes?: number
  concurrency: number
  readBlock: RangedFileBlockReader
}): RangedFile {
  if (
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !(blockBytes > 0) ||
    !(maxReadBytes >= blockBytes) ||
    !(concurrency > 0)
  ) {
    throw new Error('Invalid ranged file geometry')
  }
  const bytes = new Uint8Array(size)
  const blockCount = Math.ceil(size / blockBytes)
  const maxRunBlocks = Math.max(1, Math.floor(maxReadBytes / blockBytes))
  const state = new Uint8Array(blockCount)
  // 1 while a block is asked for and not yet dispatched, so a run of asked blocks reads as one.
  const asked = new Uint8Array(blockCount)
  const waiters = new Map<number, (() => void)[]>()
  const urgent: number[] = []
  const listeners = new Set<(progress: RangedFileProgress) => void>()
  let inFlight = 0
  let loadedBlocks = 0
  let loaded = 0
  let prefixBlocks = 0
  let fillCursor = 0
  let filling = false
  let failure: unknown = null
  const done = Promise.withResolvers<Uint8Array<ArrayBuffer>>()
  // Why: a caller that never awaits `complete` must not see an unhandled rejection on abort.
  done.promise.catch(() => {})

  const blockLength = (block: number): number => Math.min(blockBytes, size - block * blockBytes)
  const settleFailure = (error: unknown): void => {
    if (failure !== null) {
      return
    }
    failure = error ?? new RangedFileAbortedError()
    urgent.length = 0
    filling = false
    for (const list of waiters.values()) {
      for (const wake of list) {
        wake()
      }
    }
    waiters.clear()
    done.reject(failure)
  }
  const emit = (): void => {
    const progress = { loaded, total: size }
    for (const listener of listeners) {
      listener(progress)
    }
  }
  const markLoaded = (first: number, count: number): void => {
    for (let block = first; block < first + count; block += 1) {
      state[block] = LOADED
      loadedBlocks += 1
      loaded += blockLength(block)
      const list = waiters.get(block)
      waiters.delete(block)
      for (const wake of list ?? []) {
        wake()
      }
    }
    while (prefixBlocks < blockCount && state[prefixBlocks] === LOADED) {
      prefixBlocks += 1
    }
    emit()
    if (loadedBlocks === blockCount) {
      filling = false
      done.resolve(bytes)
    }
  }
  /** Adjacent missing blocks after `first` that the same read may cover. */
  const runFrom = (first: number, include: (block: number) => boolean): number => {
    let count = 1
    while (
      count < maxRunBlocks &&
      first + count < blockCount &&
      state[first + count] === MISSING &&
      include(first + count)
    ) {
      count += 1
    }
    return count
  }
  const nextRun = (): { first: number; count: number } | null => {
    while (urgent.length > 0) {
      const first = urgent.shift()!
      if (state[first] === MISSING) {
        return { first, count: runFrom(first, (block) => asked[block] === 1) }
      }
    }
    if (!filling) {
      return null
    }
    while (fillCursor < blockCount && state[fillCursor] !== MISSING) {
      fillCursor += 1
    }
    return fillCursor < blockCount
      ? { first: fillCursor, count: runFrom(fillCursor, () => true) }
      : null
  }
  const fetchRun = async (first: number, count: number): Promise<void> => {
    const offset = first * blockBytes
    const length = Math.min(count * blockBytes, size - offset)
    let lastError: unknown = null
    for (let attempt = 0; attempt < READ_ATTEMPTS && failure === null; attempt += 1) {
      try {
        const chunk = await readBlock(offset, length)
        if (chunk.length !== length) {
          throw new RangedFileChangedError()
        }
        if (failure === null) {
          bytes.set(chunk, offset)
          markLoaded(first, count)
        }
        return
      } catch (error) {
        lastError = error
        if (error instanceof RangedFileChangedError) {
          break
        }
      }
    }
    settleFailure(lastError)
  }
  const pump = (): void => {
    while (failure === null && inFlight < concurrency) {
      const run = nextRun()
      if (run === null) {
        return
      }
      for (let block = run.first; block < run.first + run.count; block += 1) {
        state[block] = IN_FLIGHT
        asked[block] = 0
      }
      inFlight += 1
      void fetchRun(run.first, run.count).finally(() => {
        inFlight -= 1
        pump()
      })
    }
  }
  const waitForBlock = (block: number): Promise<void> =>
    new Promise((resolve) => {
      const list = waiters.get(block) ?? []
      list.push(resolve)
      waiters.set(block, list)
    })

  if (blockCount === 0) {
    done.resolve(bytes)
  }

  return {
    size,
    blockBytes,
    complete: done.promise,
    read: async (begin, end) => {
      const from = Math.max(0, Math.min(begin, size))
      const to = Math.max(from, Math.min(end, size))
      const first = Math.floor(from / blockBytes)
      const last = Math.ceil(to / blockBytes)
      const pending: Promise<void>[] = []
      for (let block = first; block < last; block += 1) {
        if (state[block] !== LOADED) {
          if (state[block] === MISSING) {
            urgent.push(block)
            asked[block] = 1
          }
          pending.push(waitForBlock(block))
        }
      }
      pump()
      await Promise.all(pending)
      if (failure !== null) {
        throw failure
      }
      return bytes.slice(from, to)
    },
    fillInBackground: () => {
      if (failure === null && loadedBlocks < blockCount) {
        filling = true
        pump()
      }
    },
    pauseBackground: () => {
      filling = false
    },
    contiguousBytes: () => Math.min(size, prefixBlocks * blockBytes),
    copyLoaded: (begin, end) => bytes.slice(begin, end),
    loadedBytes: () => loaded,
    isComplete: () => loadedBlocks === blockCount,
    onProgress: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    abort: (reason) => settleFailure(reason ?? new RangedFileAbortedError())
  }
}
