import { ipcRenderer } from 'electron'

type ResearchSynctexPdfTarget = {
  experimentId: string
  /** The compiled PDF, relative to the Experiment workspace. */
  pdfPath: string
}

/** A box in PDF points, measured from the page's top-left corner. */
export type ResearchSynctexRect = { x: number; y: number; width: number; height: number }

export type ResearchSynctexSourceParams = ResearchSynctexPdfTarget & {
  pageNumber: number
  /** PDF points from the page's top-left corner. */
  x: number
  y: number
}

type ResearchSynctexFailure = { status: 'unavailable' | 'no-match' | 'error'; message: string }

export type ResearchSynctexSourceResult =
  | { status: 'ok'; sourcePath: string; line: number }
  | ResearchSynctexFailure

export type ResearchSynctexRangesParams = ResearchSynctexPdfTarget & {
  pageNumber: number
  /** The selected text's line boxes. */
  rects: ResearchSynctexRect[]
}

export type ResearchSynctexSourceRange = { sourcePath: string; startLine: number; endLine: number }

export type ResearchSynctexRangesResult =
  /** `stale`: a source file changed after the build, so its lines may have moved. */
  { status: 'ok'; ranges: ResearchSynctexSourceRange[]; stale: boolean } | ResearchSynctexFailure

export type ResearchSynctexPdfParams = ResearchSynctexPdfTarget & {
  /** Workspace-relative .tex file. */
  sourcePath: string
  line: number
}

export type ResearchSynctexPdfResult =
  | { status: 'ok'; pageNumber: number; boxes: ResearchSynctexRect[] }
  | ResearchSynctexFailure

export type ResearchSynctexApi = {
  /** PDF point → TeX line (double-click in the PDF). */
  sourceAt: (params: ResearchSynctexSourceParams) => Promise<ResearchSynctexSourceResult>
  /** Selected PDF text → TeX line ranges (PDF Revise). */
  sourceRanges: (params: ResearchSynctexRangesParams) => Promise<ResearchSynctexRangesResult>
  /** TeX line → PDF page and boxes (show the cursor in the PDF). */
  pdfAt: (params: ResearchSynctexPdfParams) => Promise<ResearchSynctexPdfResult>
}

export const researchSynctexApi: ResearchSynctexApi = {
  sourceAt: (params) => ipcRenderer.invoke('researchSynctex:sourceAt', params),
  sourceRanges: (params) => ipcRenderer.invoke('researchSynctex:sourceRanges', params),
  pdfAt: (params) => ipcRenderer.invoke('researchSynctex:pdfAt', params)
}
