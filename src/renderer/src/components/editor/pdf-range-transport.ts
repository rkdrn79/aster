import * as pdfjsLib from 'pdfjs-dist'
import type { RangedFile } from './ranged-file'

export type PdfRangeTransport = {
  transport: pdfjsLib.PDFDataRangeTransport
  dispose: () => void
}

/**
 * Feeds pdf.js from a ranged file: pdf.js asks for the ranges it needs to parse and paint, and the
 * prefix the background fill completes streams in as progressive data, so later pages need no
 * round trip. Every chunk handed to pdf.js is a copy: pdf.js transfers (detaches) its buffer.
 */
export function createPdfRangeTransport(
  file: RangedFile,
  onError: (error: unknown) => void
): PdfRangeTransport {
  let disposed = false
  const initialData = file.copyLoaded(0, file.contiguousBytes())
  let sent = initialData.length

  // Why read off the namespace here: the class is needed only when a ranged file opens.
  class RangedFileTransport extends pdfjsLib.PDFDataRangeTransport {
    override requestDataRange(begin: number, end: number): void {
      file.read(begin, end).then(
        (chunk) => {
          if (!disposed) {
            this.onDataRange(begin, chunk)
          }
        },
        (error: unknown) => {
          if (!disposed) {
            onError(error)
          }
        }
      )
    }
  }

  const transport = new RangedFileTransport(file.size, initialData, sent === file.size)
  const pushPrefix = (): void => {
    if (disposed) {
      return
    }
    const prefix = file.contiguousBytes()
    if (prefix > sent) {
      transport.onDataProgressiveRead(file.copyLoaded(sent, prefix))
      sent = prefix
      if (sent === file.size) {
        transport.onDataProgressiveDone()
      }
    }
  }
  const stopListening = file.onProgress(pushPrefix)
  return {
    transport,
    dispose: () => {
      disposed = true
      stopListening()
    }
  }
}
