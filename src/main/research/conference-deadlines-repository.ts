import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { createResearchJsonDocumentStore } from './research-json-document-store'
import {
  conferenceCatalogCacheSchema,
  conferenceTrackingSchema,
  emptyConferenceTracking,
  type ConferenceCatalogCache,
  type ConferenceTracking
} from '../../shared/research/conference-deadlines'

let writeQueue: Promise<void> = Promise.resolve()
const trackingStore = createResearchJsonDocumentStore({
  fileName: 'conference-deadlines.json',
  schema: conferenceTrackingSchema,
  empty: emptyConferenceTracking,
  label: 'Tracked conference deadlines'
})

function storePath(fileName: string): string {
  return join(getCanonicalUserDataPath(), 'research', fileName)
}

async function readJson<T>(
  fileName: string,
  schema: z.ZodType<T>,
  label: string
): Promise<T | null> {
  let content: string
  try {
    content = await readFile(storePath(fileName), 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
  const result = schema.safeParse(JSON.parse(content))
  if (!result.success) {
    throw new Error(`${label} are invalid or from an unsupported schema.`)
  }
  return result.data
}

function writeJson<T>(fileName: string, schema: z.ZodType<T>, next: T): Promise<T> {
  const pending = writeQueue.then(async () => {
    const validated = schema.parse(next)
    const file = storePath(fileName)
    await mkdir(dirname(file), { recursive: true })
    await writePluginFileAtomically(file, `${JSON.stringify(validated, null, 2)}\n`, {
      mode: 0o600
    })
    return validated
  })
  writeQueue = pending.then(
    () => undefined,
    () => undefined
  )
  return pending
}

export async function readConferenceTracking(): Promise<ConferenceTracking> {
  return trackingStore.read()
}

export function saveConferenceTracking(next: ConferenceTracking): Promise<ConferenceTracking> {
  return trackingStore.save(next)
}

/** Read-modify-write in the save queue; `mutate` may throw to leave the document unchanged. */
export function updateConferenceTracking(
  mutate: (current: ConferenceTracking) => ConferenceTracking
): Promise<ConferenceTracking> {
  return trackingStore.update(mutate)
}

export async function readConferenceCatalogCache(): Promise<ConferenceCatalogCache | null> {
  try {
    return await readJson(
      'conference-deadlines-catalog.json',
      conferenceCatalogCacheSchema,
      'Cached conference deadlines'
    )
  } catch {
    // Why: the cache is disposable; a corrupt copy is replaced on the next refresh.
    return null
  }
}

export function saveConferenceCatalogCache(
  next: ConferenceCatalogCache
): Promise<ConferenceCatalogCache> {
  return writeJson('conference-deadlines-catalog.json', conferenceCatalogCacheSchema, next)
}
