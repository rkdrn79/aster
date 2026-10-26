import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyResearchLibraryDocument,
  type LibraryScope,
  type ResearchLibraryDocument
} from '../../../../shared/research/research-library'
import { importProjectBibliography } from './research-library-bibtex-import'

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  read: vi.fn(),
  canDownload: vi.fn(),
  download: vi.fn(),
  getState: vi.fn()
}))

vi.mock('./research-file-reader', () => ({
  researchFileExists: mocks.exists,
  readResearchTextFile: mocks.read
}))
vi.mock('./research-library-pdf-download', () => ({
  canDownloadLibraryPdf: mocks.canDownload,
  downloadLibraryArxivPdf: mocks.download
}))
vi.mock('./research-library-store', () => ({
  useResearchLibrary: { getState: mocks.getState }
}))

const scope: LibraryScope = {
  hostId: 'runtime:research',
  workspaceId: 'streaming-video',
  workspacePath: '/data/projects/ExamplePaper'
}

let document: ResearchLibraryDocument

beforeEach(() => {
  document = emptyResearchLibraryDocument()
  mocks.exists.mockReset().mockResolvedValue(true)
  mocks.read
    .mockReset()
    .mockResolvedValue(
      '@article{folio,title={FOLIO},journal={arXiv preprint arXiv:2607.13298}}\n' +
        '@article{other,title={Other},doi={10.1234/other}}'
    )
  mocks.canDownload.mockReset().mockReturnValue(true)
  mocks.download.mockReset()
  mocks.getState.mockReset().mockImplementation(() => ({
    document,
    update: async (change: (current: ResearchLibraryDocument) => ResearchLibraryDocument) => {
      document = change(document)
    }
  }))
})

describe('BibTeX PDF import', () => {
  it('links the PDF to an existing unkeyed paper with the same title', async () => {
    document.papers.push({
      id: '6cdb88a7-3e9a-4f34-b4f7-5278d87d7dbd',
      scope,
      title: 'FOLIO',
      tags: [],
      status: 'unread',
      createdAt: '2026-10-26T00:00:00Z',
      updatedAt: '2026-10-26T00:00:00Z'
    })
    mocks.download.mockResolvedValue({ relativePath: '.aster/library/papers/2607.13298.pdf' })
    const result = await importProjectBibliography(scope)
    expect(result.downloaded).toBe(1)
    expect(
      document.papers.filter((paper) => paper.title === 'FOLIO').map((paper) => paper.pdfPath)
    ).toEqual(['.aster/library/papers/2607.13298.pdf', '.aster/library/papers/2607.13298.pdf'])
  })

  it('keeps citations when a download fails and fills their PDFs on retry', async () => {
    mocks.download.mockRejectedValueOnce(new Error('temporary network failure'))
    const first = await importProjectBibliography(scope)
    expect(first).toMatchObject({ added: 2, downloaded: 0, failed: 1, noDownloadSource: 1 })
    expect(document.papers.map((paper) => paper.pdfPath)).toEqual([undefined, undefined])

    mocks.download.mockResolvedValue({ relativePath: '.aster/library/papers/2607.13298.pdf' })
    const second = await importProjectBibliography(scope)
    expect(second).toMatchObject({ added: 0, downloaded: 1, failed: 0, noDownloadSource: 1 })
    expect(document.papers.map((paper) => paper.pdfPath)).toEqual([
      '.aster/library/papers/2607.13298.pdf',
      undefined
    ])
    expect(document.papers[0]).toMatchObject({
      arxivId: '2607.13298',
      externalUrl: 'https://arxiv.org/abs/2607.13298'
    })
    expect(mocks.download).toHaveBeenCalledWith(scope, '2607.13298')
  })
})
