import type { PdfFileStore, StoredPdfFile, StoredPdfFileMeta } from './research-pdf-file-cache'

const DATABASE = 'aster-pdf-file-cache'
const META = 'meta'
const DATA = 'data'

type MetaRecord = StoredPdfFileMeta & { mtime: number; ctime: number | null }

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}

function isMetaRecord(value: unknown): value is MetaRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'key') === 'string' &&
    typeof Reflect.get(value, 'size') === 'number' &&
    typeof Reflect.get(value, 'mtime') === 'number' &&
    typeof Reflect.get(value, 'usedAt') === 'number'
  )
}

/** Whole PDFs in IndexedDB: metadata apart from the bytes, so listing for eviction stays cheap. */
export function createIndexedDbPdfFileStore(factory: IDBFactory): PdfFileStore {
  let opened: Promise<IDBDatabase> | null = null
  const database = (): Promise<IDBDatabase> => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = factory.open(DATABASE, 1)
      open.onupgradeneeded = () => {
        open.result.createObjectStore(META, { keyPath: 'key' })
        open.result.createObjectStore(DATA)
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    }).catch((error: unknown) => {
      opened = null
      throw error
    })
    return opened
  }

  return {
    get: async (key) => {
      const db = await database()
      const transaction = db.transaction([META, DATA], 'readonly')
      const [meta, data] = await Promise.all([
        request(transaction.objectStore(META).get(key)),
        request(transaction.objectStore(DATA).get(key))
      ])
      if (!isMetaRecord(meta) || !(data instanceof Blob)) {
        return null
      }
      const entry: StoredPdfFile = {
        key,
        size: meta.size,
        mtime: meta.mtime,
        ...(meta.ctime === null ? {} : { ctime: meta.ctime }),
        usedAt: meta.usedAt,
        bytes: new Uint8Array(await data.arrayBuffer())
      }
      return entry
    },
    put: async (entry) => {
      const db = await database()
      const transaction = db.transaction([META, DATA], 'readwrite')
      const meta: MetaRecord = {
        key: entry.key,
        size: entry.size,
        mtime: entry.mtime,
        ctime: entry.ctime ?? null,
        usedAt: entry.usedAt
      }
      transaction.objectStore(META).put(meta)
      transaction.objectStore(DATA).put(new Blob([entry.bytes.slice()]), entry.key)
      await finished(transaction)
    },
    touch: async (key, usedAt) => {
      const db = await database()
      const transaction = db.transaction(META, 'readwrite')
      const store = transaction.objectStore(META)
      const meta: unknown = await request(store.get(key))
      if (isMetaRecord(meta)) {
        store.put({ ...meta, usedAt })
      }
      await finished(transaction)
    },
    remove: async (key) => {
      const db = await database()
      const transaction = db.transaction([META, DATA], 'readwrite')
      transaction.objectStore(META).delete(key)
      transaction.objectStore(DATA).delete(key)
      await finished(transaction)
    },
    list: async () => {
      const db = await database()
      const records: unknown[] = await request(db.transaction(META).objectStore(META).getAll())
      return records
        .filter(isMetaRecord)
        .map((record) => ({ key: record.key, size: record.size, usedAt: record.usedAt }))
    }
  }
}
