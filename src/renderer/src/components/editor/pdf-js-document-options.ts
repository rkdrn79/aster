export function buildPdfJsDocumentOptions(data: Uint8Array, baseUrl: string) {
  return {
    data,
    enableHWA: true,
    cMapUrl: new URL('cmaps/', baseUrl).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', baseUrl).href,
    wasmUrl: new URL('wasm/', baseUrl).href
  }
}
