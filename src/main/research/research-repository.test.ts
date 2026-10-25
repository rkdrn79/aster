import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyResearchDocument } from '../../shared/research/research-records'
import { readResearchDocument, saveResearchDocument } from './research-repository'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => fixture.directory
}))

beforeEach(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'aster-research-records-'))
})

afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

describe('research metadata repository', () => {
  it('serializes revisions and refuses a stale write without changing the saved file', async () => {
    const initial = await readResearchDocument()
    expect(initial.revision).toBe(0)
    const saved = await saveResearchDocument(initial)
    expect(saved.revision).toBe(1)
    const next = await saveResearchDocument(saved)
    expect(next.revision).toBe(2)
    await expect(saveResearchDocument(saved)).rejects.toThrow('another window')
    expect((await readResearchDocument()).revision).toBe(2)
    const backup = JSON.parse(
      await readFile(join(fixture.directory, 'research', 'research.json.bak'), 'utf8')
    )
    expect(backup.revision).toBe(1)
  })

  it('refuses a future schema and preserves its bytes', async () => {
    await saveResearchDocument(emptyResearchDocument())
    const file = join(fixture.directory, 'research', 'research.json')
    const future = '{"schemaVersion":99,"revision":5}'
    await writeFile(file, future)
    await expect(readResearchDocument()).rejects.toThrow('unsupported schema')
    await expect(saveResearchDocument(emptyResearchDocument())).rejects.toThrow(
      'unsupported schema'
    )
    expect(await readFile(file, 'utf8')).toBe(future)
  })
})
