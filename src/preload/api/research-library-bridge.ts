import { ipcRenderer } from 'electron'
import type {
  ArxivPaperMetadata,
  LibraryPdfImportResult,
  ResearchLibraryDocument
} from '../../shared/research/research-library'
import type { DoiPaperMetadata } from '../../shared/research/research-library-doi'

export type ResearchLibraryApi = {
  read: () => Promise<ResearchLibraryDocument>
  save: (document: ResearchLibraryDocument) => Promise<ResearchLibraryDocument>
  lookupArxiv: (params: { reference: string }) => Promise<ArxivPaperMetadata>
  /** Crossref details for a DOI; added after lookupArxiv, so renderers feature-detect it. */
  lookupDoi?: (params: { reference: string }) => Promise<DoiPaperMetadata>
  downloadArxivPdf: (params: {
    workspacePath: string
    reference: string
  }) => Promise<{ relativePath: string }>
  importPdf: (params: { workspacePath: string }) => Promise<LibraryPdfImportResult>
}

export const researchLibraryApi: ResearchLibraryApi = {
  read: () => ipcRenderer.invoke('researchLibrary:read'),
  save: (document) => ipcRenderer.invoke('researchLibrary:save', document),
  lookupArxiv: (params) => ipcRenderer.invoke('researchLibrary:lookupArxiv', params),
  lookupDoi: (params) => ipcRenderer.invoke('researchLibrary:lookupDoi', params),
  downloadArxivPdf: (params) => ipcRenderer.invoke('researchLibrary:downloadArxivPdf', params),
  importPdf: (params) => ipcRenderer.invoke('researchLibrary:importPdf', params)
}
