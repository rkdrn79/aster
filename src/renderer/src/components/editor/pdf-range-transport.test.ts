import { describe, expect, it, vi } from 'vitest'
import { createRangedFile } from './ranged-file'
import { createPdfRangeTransport } from './pdf-range-transport'

const created = vi.hoisted((): { transports: RecordingTransport[] } => ({ transports: [] }))

vi.mock('pdfjs-dist', () => {
  class PDFDataRangeTransport {
    ranges: { begin: number; chunk: Uint8Array }[] = []
    progressive: Uint8Array[] = []
    done = false
    constructor(
      readonly length: number,
      readonly initialData: Uint8Array,
      readonly progressiveDone: boolean
    ) {
      created.transports.push(this)
    }
    requestDataRange(_begin: number, _end: number): void {}
    onDataRange(begin: number, chunk: Uint8Array): void {
      this.ranges.push({ begin, chunk })
    }
    onDataProgressiveRead(chunk: Uint8Array): void {
      this.progressive.push(chunk)
    }
    onDataProgressiveDone(): void {
      this.done = true
    }
  }
  return { PDFDataRangeTransport }
})

type RecordingTransport = {
  length: number
  initialData: Uint8Array
  progressiveDone: boolean
  ranges: { begin: number; chunk: Uint8Array }[]
  progressive: Uint8Array[]
  done: boolean
  requestDataRange: (begin: number, end: number) => void
}

function latestTransport(): RecordingTransport {
  const transport = created.transports.at(-1)
  if (!transport) {
    throw new Error('no transport was created')
  }
  return transport
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function sample(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => (index * 7) % 256)
}

describe('pdf.js range transport over a ranged file', () => {
  it('starts from the loaded prefix and answers pdf.js range requests with copies', async () => {
    const bytes = sample(1000)
    const file = createRangedFile({
      size: 1000,
      blockBytes: 100,
      concurrency: 4,
      readBlock: async (offset, length) => bytes.slice(offset, offset + length)
    })
    await file.read(0, 100)
    const range = createPdfRangeTransport(file, () => {})
    const transport = latestTransport()

    expect(transport.length).toBe(1000)
    expect(transport.initialData).toEqual(bytes.slice(0, 100))
    expect(transport.progressiveDone).toBe(false)
    transport.requestDataRange(900, 1000)
    await flush()
    expect(transport.ranges).toHaveLength(1)
    expect(transport.ranges[0]!.begin).toBe(900)
    expect(transport.ranges[0]!.chunk).toEqual(bytes.slice(900))
    // A transferred chunk must never be a view onto the file's own buffer.
    expect(transport.ranges[0]!.chunk.byteLength).toBe(transport.ranges[0]!.chunk.buffer.byteLength)
    range.dispose()
  })

  it('streams the growing prefix in order and finishes once the file is whole', async () => {
    const bytes = sample(300)
    const file = createRangedFile({
      size: 300,
      blockBytes: 100,
      concurrency: 1,
      readBlock: async (offset, length) => bytes.slice(offset, offset + length)
    })
    await file.read(0, 100)
    const range = createPdfRangeTransport(file, () => {})
    const transport = latestTransport()

    file.fillInBackground()
    await file.complete
    await flush()
    const streamed = new Uint8Array(transport.progressive.reduce((sum, c) => sum + c.length, 0))
    let offset = 0
    for (const chunk of transport.progressive) {
      streamed.set(chunk, offset)
      offset += chunk.length
    }
    expect(streamed).toEqual(bytes.slice(100))
    expect(transport.done).toBe(true)
    range.dispose()
  })

  it('marks an already whole file as done and reports failed ranges', async () => {
    const bytes = sample(50)
    const whole = createRangedFile({
      size: 50,
      blockBytes: 100,
      concurrency: 1,
      readBlock: async (offset, length) => bytes.slice(offset, offset + length)
    })
    await whole.read(0, 50)
    createPdfRangeTransport(whole, () => {})
    expect(latestTransport().progressiveDone).toBe(true)

    const failing = createRangedFile({
      size: 200,
      blockBytes: 100,
      concurrency: 1,
      readBlock: async () => {
        throw new Error('host gone')
      }
    })
    const onError = vi.fn()
    createPdfRangeTransport(failing, onError)
    latestTransport().requestDataRange(0, 100)
    await flush()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'host gone' }))
  })

  it('stops talking to pdf.js once disposed', async () => {
    const bytes = sample(200)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const file = createRangedFile({
      size: 200,
      blockBytes: 100,
      concurrency: 2,
      readBlock: async (offset, length) => {
        await gate
        return bytes.slice(offset, offset + length)
      }
    })
    const range = createPdfRangeTransport(file, () => {})
    const transport = latestTransport()
    transport.requestDataRange(100, 200)
    file.fillInBackground()
    range.dispose()
    release()
    await file.complete
    await flush()
    expect(transport.ranges).toEqual([])
    expect(transport.progressive).toEqual([])
  })
})
