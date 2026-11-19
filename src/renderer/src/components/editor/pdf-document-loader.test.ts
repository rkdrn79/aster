// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPdfDocumentLoader } from './pdf-document-loader'
import { createRangedFile } from './ranged-file'
import type { PdfDocumentSource } from './pdf-document-source'

type TaskHandle = { destroy: ReturnType<typeof vi.fn>; resolve: (doc: unknown) => void }

const pdf = vi.hoisted((): { getDocument: ReturnType<typeof vi.fn>; tasks: TaskHandle[] } => ({
  getDocument: vi.fn(),
  tasks: []
}))

vi.mock('pdfjs-dist', () => {
  class PDFDataRangeTransport {
    constructor(
      readonly length: number,
      readonly initialData: Uint8Array
    ) {}
    onDataRange(): void {}
    onDataProgressiveRead(): void {}
    onDataProgressiveDone(): void {}
  }
  return { GlobalWorkerOptions: {}, getDocument: pdf.getDocument, PDFDataRangeTransport }
})

function pendingTask() {
  let resolve: (doc: unknown) => void = () => {}
  const task = {
    promise: new Promise((done) => {
      resolve = done
    }),
    destroy: vi.fn(() => Promise.resolve())
  }
  pdf.tasks.push({ destroy: task.destroy, resolve })
  return task
}

function rangedSource(size: number): PdfDocumentSource {
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 256)
  const ranged = createRangedFile({
    size,
    blockBytes: 100,
    concurrency: 2,
    readBlock: async (offset, length) => bytes.slice(offset, offset + length)
  })
  return { key: 'k', size, bytes: null, ranged }
}

afterEach(() => {
  pdf.getDocument.mockReset()
  pdf.tasks.length = 0
  vi.useRealTimers()
})

describe('PDF document loader', () => {
  it('decodes base64 content for pdf.js', () => {
    pdf.getDocument.mockImplementation(pendingTask)
    const loader = createPdfDocumentLoader({ display: () => () => {}, onError: () => {} })
    loader.load(btoa('%PDF-1.7'))
    expect(new TextDecoder().decode(pdf.getDocument.mock.calls[0]![0].data)).toBe('%PDF-1.7')
  })

  it('hands pdf.js a copy of cached bytes, since pdf.js detaches what it gets', () => {
    pdf.getDocument.mockImplementation(pendingTask)
    const bytes = new TextEncoder().encode('%PDF-1.7')
    const loader = createPdfDocumentLoader({ display: () => () => {}, onError: () => {} })
    loader.load({ key: 'k', size: bytes.length, bytes, ranged: null })
    const data: Uint8Array = pdf.getDocument.mock.calls[0]![0].data
    expect(data).toEqual(bytes)
    expect(data.buffer).not.toBe(bytes.buffer)
  })

  it('opens a ranged file through a range transport and reports its progress', async () => {
    pdf.getDocument.mockImplementation(pendingTask)
    const source = rangedSource(1000)
    await source.ranged!.read(0, 100)
    const onProgress = vi.fn()
    const loader = createPdfDocumentLoader({
      display: () => () => {},
      onError: () => {},
      onProgress
    })
    loader.load(source)

    const options = pdf.getDocument.mock.calls[0]![0]
    expect(options.range.length).toBe(1000)
    expect(options.range.initialData).toEqual(Uint8Array.from({ length: 100 }, (_, i) => i))
    expect(options).toMatchObject({ rangeChunkSize: 100, disableAutoFetch: true })
    expect(options.data).toBeUndefined()
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 100, total: 1000 })
    await source.ranged!.read(900, 1000)
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 200, total: 1000 })
  })

  it('downloads the rest once the first page paints, or after a fallback delay', async () => {
    vi.useFakeTimers()
    pdf.getDocument.mockImplementation(pendingTask)
    const painted = rangedSource(1000)
    const fill = vi.spyOn(painted.ranged!, 'fillInBackground')
    const loader = createPdfDocumentLoader({ display: () => () => {}, onError: () => {} })
    loader.load(painted)
    pdf.tasks[0]!.resolve({})
    await vi.advanceTimersByTimeAsync(0)
    expect(fill).not.toHaveBeenCalled()
    loader.notifyPainted()
    expect(fill).toHaveBeenCalledTimes(1)

    const hidden = rangedSource(1000)
    const hiddenFill = vi.spyOn(hidden.ranged!, 'fillInBackground')
    loader.load(hidden)
    pdf.tasks[1]!.resolve({})
    await vi.advanceTimersByTimeAsync(1499)
    expect(hiddenFill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(hiddenFill).toHaveBeenCalledTimes(1)
  })

  it('destroys every task and stops progress on dispose', async () => {
    pdf.getDocument.mockImplementation(pendingTask)
    const source = rangedSource(1000)
    const onProgress = vi.fn()
    const loader = createPdfDocumentLoader({
      display: () => () => {},
      onError: () => {},
      onProgress
    })
    loader.load(source)
    loader.dispose()
    expect(pdf.tasks[0]!.destroy).toHaveBeenCalledTimes(1)
    onProgress.mockClear()
    await source.ranged!.read(0, 100)
    expect(onProgress).not.toHaveBeenCalled()
  })

  it('keeps quiet when a superseded read is aborted under the old view', async () => {
    pdf.getDocument.mockImplementation(pendingTask)
    const source = rangedSource(1000)
    const onError = vi.fn()
    const loader = createPdfDocumentLoader({ display: () => () => {}, onError })
    loader.load(source)
    source.ranged!.abort()
    pdf.getDocument.mock.calls[0]![0].range.requestDataRange(0, 100)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).not.toHaveBeenCalledWith(expect.any(String))
  })

  it('shows a file that changed mid-read as such', async () => {
    pdf.getDocument.mockImplementation(pendingTask)
    const ranged = createRangedFile({
      size: 300,
      blockBytes: 100,
      concurrency: 1,
      readBlock: async () => new Uint8Array(3)
    })
    const onError = vi.fn()
    const loader = createPdfDocumentLoader({ display: () => () => {}, onError })
    loader.load({ key: 'k', size: 300, bytes: null, ranged })
    const options = pdf.getDocument.mock.calls[0]![0]
    options.range.requestDataRange(0, 100)
    await vi.waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(
        expect.stringContaining('changed while it was loading')
      )
    )
  })
})
