import { describe, expect, it, vi } from 'vitest'
import {
  createPdfFileCache,
  type PdfFileStore,
  type StoredPdfFile
} from './research-pdf-file-cache'

function memoryStore(): PdfFileStore & { entries: Map<string, StoredPdfFile> } {
  const entries = new Map<string, StoredPdfFile>()
  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    put: async (entry) => {
      entries.set(entry.key, { ...entry, bytes: entry.bytes.slice() })
    },
    touch: async (key, usedAt) => {
      const entry = entries.get(key)
      if (entry) {
        entries.set(key, { ...entry, usedAt })
      }
    },
    remove: async (key) => {
      entries.delete(key)
    },
    list: async () => [...entries.values()].map(({ key, size, usedAt }) => ({ key, size, usedAt }))
  }
}

const bytesOf = (size: number, fill = 1): Uint8Array => new Uint8Array(size).fill(fill)
const v = (size: number, mtime = 1, ctime?: number) => ({ size, mtime, ctime })

describe('PDF file cache', () => {
  it('returns bytes only while size and change times still match', async () => {
    const cache = createPdfFileCache({ memoryBudgetBytes: 100, storeBudgetBytes: 0, store: null })
    const bytes = bytesOf(10)
    await cache.put('a', v(10, 5, 6), bytes, false)

    expect(await cache.get('a', v(10, 5, 6), false)).toBe(bytes)
    expect(await cache.get('a', v(10, 7, 6), false)).toBeNull()
    expect(await cache.get('a', v(10, 5, 9), false)).toBeNull()
    expect(await cache.get('a', v(11, 5, 6), false)).toBeNull()
    expect(await cache.get('b', v(10, 5, 6), false)).toBeNull()
  })

  it('evicts the least recently used files past the memory budget', async () => {
    const cache = createPdfFileCache({ memoryBudgetBytes: 25, storeBudgetBytes: 0, store: null })
    await cache.put('a', v(10), bytesOf(10), false)
    await cache.put('b', v(10), bytesOf(10), false)
    expect(await cache.get('a', v(10), false)).not.toBeNull()
    await cache.put('c', v(10), bytesOf(10), false)

    expect(await cache.get('b', v(10), false)).toBeNull()
    expect(await cache.get('a', v(10), false)).not.toBeNull()
    expect(await cache.get('c', v(10), false)).not.toBeNull()
    await cache.put('huge', v(30), bytesOf(30), false)
    expect(await cache.get('huge', v(30), false)).toBeNull()
  })

  it('persists remote files across a restart and drops a changed copy', async () => {
    const store = memoryStore()
    const first = createPdfFileCache({ memoryBudgetBytes: 100, storeBudgetBytes: 100, store })
    await first.put('remote', v(10, 3), bytesOf(10, 7), true)
    await first.put('local', v(10, 3), bytesOf(10, 8), false)
    expect([...store.entries.keys()]).toEqual(['remote'])

    const restarted = createPdfFileCache({ memoryBudgetBytes: 100, storeBudgetBytes: 100, store })
    expect(await restarted.get('remote', v(10, 3), true)).toEqual(bytesOf(10, 7))
    expect(await restarted.get('remote', v(10, 4), true)).toBeNull()
    expect(await restarted.get('local', v(10, 3), false)).toBeNull()
  })

  it('evicts the oldest stored files past the store budget', async () => {
    const store = memoryStore()
    let clock = 0
    const cache = createPdfFileCache({
      memoryBudgetBytes: 0,
      storeBudgetBytes: 25,
      store,
      now: () => ++clock
    })
    await cache.put('a', v(10), bytesOf(10), true)
    await cache.put('b', v(10), bytesOf(10), true)
    await cache.get('a', v(10), true)
    await vi.waitFor(() => expect(store.entries.get('a')?.usedAt).toBe(3))
    await cache.put('c', v(10), bytesOf(10), true)

    expect([...store.entries.keys()].toSorted()).toEqual(['a', 'c'])
  })

  it('treats a failing store as a cache miss', async () => {
    const store = memoryStore()
    store.get = async () => {
      throw new Error('quota')
    }
    store.put = async () => {
      throw new Error('quota')
    }
    const cache = createPdfFileCache({ memoryBudgetBytes: 0, storeBudgetBytes: 100, store })
    await expect(cache.put('a', v(10), bytesOf(10), true)).resolves.toBeUndefined()
    await expect(cache.get('a', v(10), true)).resolves.toBeNull()
  })
})
