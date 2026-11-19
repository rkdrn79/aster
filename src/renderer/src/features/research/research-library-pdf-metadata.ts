import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  buildPdfJsDocumentOptions,
  buildPdfJsRangeDocumentOptions
} from '@/components/editor/pdf-js-document-options'
import type { PdfDocumentSource } from '@/components/editor/pdf-document-source'
import { createPdfRangeTransport } from '@/components/editor/pdf-range-transport'
import {
  findPaperIdentifiers,
  pdfDateYear,
  titleFromFirstPage,
  usablePdfInfoAuthors,
  usablePdfInfoTitle,
  type PdfPaperIdentifiers,
  type PdfTextRun
} from './research-library-pdf-title'

// Same worker PdfViewer uses; this module loads only when a PDF is imported.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfPaperMetadata = PdfPaperIdentifiers & {
  title: string | null
  authors: string | null
  year: number | null
}

function textRuns(items: readonly unknown[]): PdfTextRun[] {
  return items.flatMap((item) =>
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof item.str === 'string' &&
    'transform' in item &&
    Array.isArray(item.transform)
      ? [{ str: item.str, transform: item.transform.filter((n) => typeof n === 'number') }]
      : []
  )
}

function infoField(info: unknown, key: string): unknown {
  return typeof info === 'object' && info !== null ? Reflect.get(info, key) : undefined
}

function openDocument(source: Uint8Array | PdfDocumentSource) {
  const bytes = source instanceof Uint8Array ? source : source.bytes
  if (bytes) {
    // Why a copy: pdf.js detaches the buffer it gets, and the cache keeps these bytes.
    return {
      task: pdfjsLib.getDocument(buildPdfJsDocumentOptions(bytes.slice(), document.baseURI)),
      release: () => {}
    }
  }
  const ranged = source instanceof Uint8Array ? null : source.ranged
  if (!ranged) {
    throw new Error('The PDF has no bytes to read.')
  }
  const range = createPdfRangeTransport(ranged, () => {})
  return {
    task: pdfjsLib.getDocument(
      buildPdfJsRangeDocumentOptions(
        { transport: range.transport, chunkBytes: ranged.blockBytes },
        document.baseURI
      )
    ),
    release: range.dispose
  }
}

/**
 * Title, authors and year from the PDF's own metadata, else the largest text on page 1. A ranged
 * source reads only what the info dictionary and page 1 need, not the whole paper.
 */
export async function readPdfPaperMetadata(
  source: Uint8Array | PdfDocumentSource,
  fileStem: string
): Promise<PdfPaperMetadata> {
  const { task, release } = openDocument(source)
  try {
    const pdf = await task.promise
    const { info } = await pdf.getMetadata().catch(() => ({ info: null }))
    const page = await pdf.getPage(1)
    const runs = textRuns((await page.getTextContent()).items)
    const title =
      usablePdfInfoTitle(infoField(info, 'Title'), fileStem) ??
      titleFromFirstPage(runs, page.getViewport({ scale: 1 }).height)
    return {
      title,
      authors: usablePdfInfoAuthors(infoField(info, 'Author')),
      year: pdfDateYear(infoField(info, 'CreationDate')),
      // Why page 1 only: later pages hold the reference list, whose IDs belong to other papers.
      ...findPaperIdentifiers(runs.map((run) => run.str).join(' '))
    }
  } finally {
    release()
    void task.destroy().catch(() => {})
  }
}
