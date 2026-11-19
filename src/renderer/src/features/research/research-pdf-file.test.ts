import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { createPdfFileCache, type PdfFileStore } from './research-pdf-file-cache'
import {
  openManuscriptPdf,
  readManuscriptPdf,
  resetManuscriptPdfFilesForTests
} from './research-pdf-file'
import { resolveManuscriptFile } from './research-writing-source'

type FakeHost = {
  bytes: Uint8Array
  mtime: number
  remote: boolean
  reads: { offset: number; length: number }[]
  readerArgs: unknown[]
}

const host = vi.hoisted((): FakeHost => ({
  bytes: new Uint8Array(),
  mtime: 1,
  remote: false,
  reads: [],
  readerArgs: []
}))

vi.mock('@/runtime/runtime-client-target', () => ({
  runtimeRpcTargetForAuthorityKey: () => ({ kind: 'local' })
}))
vi.mock('@/runtime/runtime-file-range-client', () => ({
  statRuntimeReadTarget: async () => ({
    size: host.bytes.length,
    mtime: host.mtime,
    ctime: host.mtime,
    isDirectory: false
  }),
  runtimeFileBlockReader: (args: unknown) => {
    host.readerArgs.push(args)
    return {
      remote: host.remote,
      blockBytes: 100,
      concurrency: 2,
      read: async (offset: number, length: number) => {
        host.reads.push({ offset, length })
        return host.bytes.slice(offset, offset + length)
      }
    }
  }
}))

const owner: Pick<ExperimentRecord, 'hostId' | 'workspaceId' | 'workspacePath'> = {
  hostId: 'local',
  workspaceId: 'workspace',
  workspacePath: '/research/project'
}

function pdfBytes(size: number, seed = 0): Uint8Array {
  const bytes = Uint8Array.from({ length: size }, (_, index) => (index + seed) % 251)
  bytes.set(new TextEncoder().encode('%PDF-1.7'))
  return bytes
}

function recordingStore(): PdfFileStore & { puts: string[] } {
  const puts: string[] = []
  return {
    puts,
    get: async () => null,
    put: async (entry) => {
      puts.push(entry.key)
    },
    touch: async () => {},
    remove: async () => {},
    list: async () => []
  }
}

const file = () => resolveManuscriptFile(owner, 'paper/main.pdf', '.pdf')

describe('opening a workspace PDF', () => {
  let store: ReturnType<typeof recordingStore>
  beforeEach(() => {
    host.bytes = new Uint8Array()
    host.mtime = 1
    host.remote = false
    host.reads = []
    host.readerArgs = []
    store = recordingStore()
    resetManuscriptPdfFilesForTests(
      createPdfFileCache({ memoryBudgetBytes: 10_000, storeBudgetBytes: 10_000, store })
    )
  })

  it('reads a small PDF whole, byte for byte, from the workspace path', async () => {
    host.bytes = pdfBytes(250)
    const pdf = await readManuscriptPdf(owner, file())

    expect(pdf.bytes).toEqual(host.bytes)
    expect(pdf.mtime).toBe(1)
    expect(host.readerArgs[0]).toMatchObject({
      filePath: '/research/project/paper/main.pdf',
      relativePath: 'paper/main.pdf',
      access: { kind: 'research-workspace', workspacePath: '/research/project' }
    })
  })

  it('opens a large PDF ranged, reading the header and the tail first', async () => {
    host.bytes = pdfBytes(1000)
    const source = await openManuscriptPdf(owner, file())

    expect(source.bytes).toBeNull()
    expect(source.ranged?.size).toBe(1000)
    expect(host.reads.slice(0, 2)).toEqual([
      { offset: 0, length: 100 },
      { offset: 900, length: 100 }
    ])
    expect(await source.whole()).toEqual(host.bytes)
    source.release()
  })

  it('reopens an unchanged PDF from the cache and reads a rebuilt one again', async () => {
    host.bytes = pdfBytes(1000)
    const first = await openManuscriptPdf(owner, file())
    await first.whole()
    first.release()
    await vi.waitFor(async () => {
      const again = await openManuscriptPdf(owner, file())
      expect(again.bytes).toEqual(host.bytes)
    })
    const readsBefore = host.reads.length

    host.bytes = pdfBytes(1000, 3)
    host.mtime = 2
    const rebuilt = await openManuscriptPdf(owner, file())
    expect(rebuilt.bytes).toBeNull()
    expect(await rebuilt.whole()).toEqual(host.bytes)
    expect(host.reads.length).toBeGreaterThan(readsBefore)
    expect(rebuilt.key).not.toBe(first.key)
  })

  it('persists only remote PDFs', async () => {
    host.bytes = pdfBytes(250)
    await readManuscriptPdf(owner, file())
    host.remote = true
    host.mtime = 2
    await readManuscriptPdf(owner, file())
    await vi.waitFor(() => expect(store.puts).toHaveLength(1))
  })

  it('does not cache a PDF that changed while it was read', async () => {
    host.bytes = pdfBytes(1000)
    const source = await openManuscriptPdf(owner, file())
    host.mtime = 9
    await source.whole()
    source.release()
    host.mtime = 1
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await openManuscriptPdf(owner, file())).bytes).toBeNull()
  })

  it('shares one read between viewers of the same version', async () => {
    host.bytes = pdfBytes(1000)
    const first = await openManuscriptPdf(owner, file())
    const second = await openManuscriptPdf(owner, file())
    expect(second.ranged).toBe(first.ranged)
    first.release()
    second.release()
  })

  it('refuses files that are not PDFs or are over the limit', async () => {
    host.bytes = new TextEncoder().encode('not a pdf at all')
    await expect(openManuscriptPdf(owner, file())).rejects.toThrow('not a PDF')
    host.bytes = pdfBytes(1000)
    host.mtime = 2
    await expect(openManuscriptPdf(owner, file(), 500)).rejects.toThrow('limit')
  })
})
