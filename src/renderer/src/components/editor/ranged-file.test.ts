import { describe, expect, it } from 'vitest'
import { createRangedFile, RangedFileChangedError } from './ranged-file'

function fileBytes(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => index % 251)
}

/** A block reader whose reads finish only when the test releases them, in any order. */
function controlledReader(bytes: Uint8Array) {
  const pending: { offset: number; length: number; finish: () => void }[] = []
  const started: number[] = []
  let inFlight = 0
  let maxInFlight = 0
  const read = (offset: number, length: number): Promise<Uint8Array> => {
    started.push(offset)
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    return new Promise((resolve) => {
      pending.push({
        offset,
        length,
        finish: () => {
          inFlight -= 1
          resolve(bytes.slice(offset, offset + length))
        }
      })
    })
  }
  const finish = async (offset?: number): Promise<void> => {
    const index = offset === undefined ? 0 : pending.findIndex((read) => read.offset === offset)
    const [read] = pending.splice(index, 1)
    read?.finish()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  const drain = async (): Promise<void> => {
    while (pending.length > 0) {
      await finish()
    }
  }
  return { read, started, pending, finish, drain, maxInFlight: () => maxInFlight }
}

describe('ranged file', () => {
  it('returns requested ranges across block boundaries as copies', async () => {
    const bytes = fileBytes(1000)
    const reader = controlledReader(bytes)
    const file = createRangedFile({
      size: 1000,
      blockBytes: 100,
      concurrency: 4,
      readBlock: reader.read
    })

    const range = file.read(150, 320)
    expect(reader.started).toEqual([100, 200, 300])
    await reader.drain()
    const chunk = await range
    expect(chunk).toEqual(bytes.slice(150, 320))
    chunk.fill(0)
    expect(await file.read(150, 320)).toEqual(bytes.slice(150, 320))
    expect(reader.started).toEqual([100, 200, 300])
  })

  it('serves requested ranges before the background fill and caps reads in flight', async () => {
    const bytes = fileBytes(1000)
    const reader = controlledReader(bytes)
    const file = createRangedFile({
      size: 1000,
      blockBytes: 100,
      concurrency: 2,
      readBlock: reader.read
    })

    file.fillInBackground()
    expect(reader.started).toEqual([0, 100])
    const tail = file.read(900, 1000)
    await reader.finish(0)
    // The freed slot goes to the requested tail, not to block 200 of the fill.
    expect(reader.started).toEqual([0, 100, 900])
    await reader.drain()
    expect(await tail).toEqual(bytes.slice(900))
    expect(reader.maxInFlight()).toBe(2)
    expect(await file.complete).toEqual(bytes)
    expect(reader.started.toSorted((a, b) => a - b)).toEqual([
      0, 100, 200, 300, 400, 500, 600, 700, 800, 900
    ])
  })

  it('tracks the loaded prefix and reports progress', async () => {
    const bytes = fileBytes(250)
    const reader = controlledReader(bytes)
    const file = createRangedFile({
      size: 250,
      blockBytes: 100,
      concurrency: 3,
      readBlock: reader.read
    })
    const progress: number[] = []
    file.onProgress(({ loaded, total }) => {
      expect(total).toBe(250)
      progress.push(loaded)
    })

    file.fillInBackground()
    await reader.finish(100)
    expect(file.contiguousBytes()).toBe(0)
    await reader.finish(0)
    expect(file.contiguousBytes()).toBe(200)
    expect(file.copyLoaded(0, 200)).toEqual(bytes.slice(0, 200))
    await reader.finish(200)
    expect(file.contiguousBytes()).toBe(250)
    expect(file.isComplete()).toBe(true)
    expect(progress).toEqual([100, 200, 250])
  })

  it('pauses the background fill without stopping requested ranges', async () => {
    const bytes = fileBytes(500)
    const reader = controlledReader(bytes)
    const file = createRangedFile({
      size: 500,
      blockBytes: 100,
      concurrency: 1,
      readBlock: reader.read
    })

    file.fillInBackground()
    file.pauseBackground()
    await reader.finish(0)
    expect(reader.started).toEqual([0])
    const range = file.read(300, 400)
    await reader.finish(300)
    expect(await range).toEqual(bytes.slice(300, 400))
    expect(reader.started).toEqual([0, 300])
    file.fillInBackground()
    await reader.drain()
    expect(await file.complete).toEqual(bytes)
  })

  it('retries a failed block once, then fails every waiter', async () => {
    let calls = 0
    const flaky = createRangedFile({
      size: 10,
      blockBytes: 10,
      concurrency: 1,
      readBlock: async (offset, length) => {
        calls += 1
        if (calls === 1) {
          throw new Error('timeout')
        }
        return fileBytes(10).slice(offset, offset + length)
      }
    })
    expect(await flaky.read(0, 10)).toEqual(fileBytes(10))

    const broken = createRangedFile({
      size: 20,
      blockBytes: 10,
      concurrency: 2,
      readBlock: async () => {
        throw new Error('host gone')
      }
    })
    await expect(broken.read(0, 20)).rejects.toThrow('host gone')
    await expect(broken.complete).rejects.toThrow('host gone')
  })

  it('treats a short block as a file that changed during the read', async () => {
    const file = createRangedFile({
      size: 20,
      blockBytes: 10,
      concurrency: 1,
      readBlock: async () => new Uint8Array(4)
    })
    await expect(file.read(0, 10)).rejects.toBeInstanceOf(RangedFileChangedError)
  })

  it('rejects pending ranges on abort and ignores late blocks', async () => {
    const bytes = fileBytes(200)
    const reader = controlledReader(bytes)
    const file = createRangedFile({
      size: 200,
      blockBytes: 100,
      concurrency: 2,
      readBlock: reader.read
    })
    const range = file.read(0, 200)
    file.abort(new Error('closed'))
    await expect(range).rejects.toThrow('closed')
    await reader.drain()
    expect(file.loadedBytes()).toBe(0)
  })

  it('completes an empty file at once', async () => {
    const file = createRangedFile({
      size: 0,
      blockBytes: 100,
      concurrency: 1,
      readBlock: async () => new Uint8Array()
    })
    expect(await file.complete).toEqual(new Uint8Array())
    expect(await file.read(0, 10)).toEqual(new Uint8Array())
  })
})

describe('ranged file reads over a fine block grid', () => {
  it('reads only the blocks a range touches, merged into one read', async () => {
    const bytes = fileBytes(1000)
    const reads: [number, number][] = []
    const file = createRangedFile({
      size: 1000,
      blockBytes: 10,
      maxReadBytes: 40,
      concurrency: 4,
      readBlock: async (offset, length) => {
        reads.push([offset, length])
        return bytes.slice(offset, offset + length)
      }
    })

    expect(await file.read(505, 512)).toEqual(bytes.slice(505, 512))
    expect(reads).toEqual([[500, 20]])
    expect(await file.read(100, 190)).toEqual(bytes.slice(100, 190))
    // A long range splits at the read cap, and every part is in flight at once.
    expect(reads.slice(1)).toEqual([
      [100, 40],
      [140, 40],
      [180, 10]
    ])
  })

  it('fills the rest with full-size reads that skip loaded blocks', async () => {
    const bytes = fileBytes(100)
    const reads: [number, number][] = []
    const file = createRangedFile({
      size: 100,
      blockBytes: 10,
      maxReadBytes: 40,
      concurrency: 1,
      readBlock: async (offset, length) => {
        reads.push([offset, length])
        return bytes.slice(offset, offset + length)
      }
    })
    await file.read(20, 30)
    file.fillInBackground()
    expect(await file.complete).toEqual(bytes)
    expect(reads).toEqual([
      [20, 10],
      [0, 20],
      [30, 40],
      [70, 30]
    ])
  })
})
