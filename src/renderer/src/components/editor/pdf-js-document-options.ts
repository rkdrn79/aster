import type { PDFDataRangeTransport } from 'pdfjs-dist'

function resourceOptions(baseUrl: string) {
  return {
    enableHWA: true,
    cMapUrl: new URL('cmaps/', baseUrl).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', baseUrl).href,
    wasmUrl: new URL('wasm/', baseUrl).href
  }
}

export function buildPdfJsDocumentOptions(data: Uint8Array, baseUrl: string) {
  return { data, ...resourceOptions(baseUrl) }
}

/** pdf.js reads through `range`, asking only for what it parses and paints. */
export function buildPdfJsRangeDocumentOptions(
  range: { transport: PDFDataRangeTransport; chunkBytes: number },
  baseUrl: string
) {
  return {
    // The transport carries the file length.
    range: range.transport,
    // Why one pdf.js chunk per host read: pdf.js aligns every request to this size.
    rangeChunkSize: range.chunkBytes,
    // Why: the ranged file's own fill streams the rest in, several reads at a time; pdf.js's
    // auto-fetch would ask for one chunk per round trip.
    disableAutoFetch: true,
    ...resourceOptions(baseUrl)
  }
}
