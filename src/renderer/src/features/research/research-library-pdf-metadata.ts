import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { buildPdfJsDocumentOptions } from '@/components/editor/pdf-js-document-options'
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

/** Title, authors and year from the PDF's own metadata, else the largest text on page 1. */
export async function readPdfPaperMetadata(
  bytes: Uint8Array,
  fileStem: string
): Promise<PdfPaperMetadata> {
  const task = pdfjsLib.getDocument(buildPdfJsDocumentOptions(bytes, document.baseURI))
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
    void task.destroy().catch(() => {})
  }
}
