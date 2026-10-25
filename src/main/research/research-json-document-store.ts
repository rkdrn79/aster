import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'

/** A validated JSON document under `<userData>/research/`, written atomically one save at a time. */
export function createResearchJsonDocumentStore<T extends { revision?: number }>(options: {
  fileName: string
  schema: z.ZodType<T>
  empty: () => T
  /** Names the document in the error a corrupt or newer file raises. */
  label: string
}): {
  read: () => Promise<T>
  save: (next: T) => Promise<T>
  /** Read-modify-write in the save queue, so concurrent in-process updates never collide. */
  update: (mutate: (current: T) => T | Promise<T>) => Promise<T>
} {
  let writeQueue: Promise<void> = Promise.resolve()
  const path = (): string => join(getCanonicalUserDataPath(), 'research', options.fileName)

  async function read(): Promise<T> {
    let content: string
    try {
      content = await readFile(path(), 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return options.empty()
      }
      throw error
    }
    const result = options.schema.safeParse(JSON.parse(content))
    if (!result.success) {
      throw new Error(`${options.label} are invalid or from an unsupported schema.`)
    }
    return result.data
  }

  function enqueue(work: () => Promise<T>): Promise<T> {
    const pending = writeQueue.then(work)
    writeQueue = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }

  function save(next: T): Promise<T> {
    return enqueue(async () => {
      const validated = options.schema.parse(next)
      const current = await read()
      if ((validated.revision ?? 0) !== (current.revision ?? 0)) {
        throw new Error(`${options.label} changed in another window. Reload before saving.`)
      }
      return persist(validated, current)
    })
  }

  function update(mutate: (current: T) => T | Promise<T>): Promise<T> {
    return enqueue(async () => {
      const current = await read()
      return persist(options.schema.parse(await mutate(current)), current)
    })
  }

  async function persist(validated: T, current: T): Promise<T> {
    const saved = options.schema.parse({ ...validated, revision: (current.revision ?? 0) + 1 })
    const file = path()
    await mkdir(dirname(file), { recursive: true })
    try {
      await copyFile(file, `${file}.bak`)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
    await writePluginFileAtomically(file, `${JSON.stringify(saved, null, 2)}\n`, {
      mode: 0o600
    })
    return saved
  }

  return { read, save, update }
}
