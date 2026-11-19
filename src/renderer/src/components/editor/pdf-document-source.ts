import type { RangedFile } from './ranged-file'

/**
 * A PDF for the viewer: the whole file when it is cached or small, else a ranged file that pdf.js
 * reads on demand while the rest streams in. Exactly one of `bytes` and `ranged` is set.
 */
export type PdfDocumentSource = {
  /** Changes whenever the file's content may have changed. */
  key: string
  size: number
  bytes: Uint8Array | null
  ranged: RangedFile | null
}
