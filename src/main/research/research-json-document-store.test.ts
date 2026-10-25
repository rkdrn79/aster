import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  emptyResearchComputeLinksDocument,
  researchComputeLinksDocumentSchema
} from '../../shared/research/research-compute-links'
import { createResearchJsonDocumentStore } from './research-json-document-store'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => fixture.directory
}))

const store = createResearchJsonDocumentStore({
  fileName: 'compute-links.json',
  schema: researchComputeLinksDocumentSchema,
  empty: emptyResearchComputeLinksDocument,
  label: 'Compute project links'
})

beforeEach(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'aster-research-document-'))
})

afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

describe('research JSON document store', () => {
  it('accepts an older document once, then rejects a concurrent stale save and retains a backup', async () => {
    const file = join(fixture.directory, 'research', 'compute-links.json')
    await mkdir(join(fixture.directory, 'research'))
    const legacy = '{"schemaVersion":1,"links":[]}'
    await writeFile(file, legacy)
    const firstWindow = await store.read()
    const secondWindow = await store.read()
    expect(firstWindow.revision).toBeUndefined()

    const saved = await store.save(firstWindow)
    expect(saved.revision).toBe(1)
    await expect(store.save(secondWindow)).rejects.toThrow('another window')
    expect((await store.read()).revision).toBe(1)
    expect(await readFile(`${file}.bak`, 'utf8')).toBe(legacy)
  })

  it('does not overwrite a document from a newer schema', async () => {
    const file = join(fixture.directory, 'research', 'compute-links.json')
    await mkdir(join(fixture.directory, 'research'))
    const future = '{"schemaVersion":2,"links":[],"revision":9}'
    await writeFile(file, future)
    await expect(store.save(emptyResearchComputeLinksDocument())).rejects.toThrow(
      'unsupported schema'
    )
    expect(await readFile(file, 'utf8')).toBe(future)
  })
})
