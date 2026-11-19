// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'

const mocks = vi.hoisted(() => ({ openManuscriptPdf: vi.fn(), release: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: (select: (state: { openFiles: [] }) => unknown) => select({ openFiles: [] })
}))
vi.mock('./research-pdf-file', () => ({ openManuscriptPdf: mocks.openManuscriptPdf }))
vi.mock('./research-writing-source', () => ({
  resolveManuscriptFile: (owner: { workspacePath: string }, path: string) => ({
    absolutePath: `${owner.workspacePath}/${path}`,
    relativePath: path
  })
}))
vi.mock('./research-writing-compile', () => ({
  useWritingCompile: () => ({
    compiling: false,
    startedAt: null,
    log: '',
    error: null,
    canCancel: false,
    compile: vi.fn(),
    cancel: vi.fn()
  })
}))
vi.mock('./ResearchWritingCompileLog', () => ({
  ResearchWritingCompileLogDialog: () => null,
  ResearchWritingCompileStatus: () => null
}))
vi.mock('@/components/editor/PdfViewer', () => ({ default: () => <div>PDF page</div> }))

import { ResearchWritingPdfPane } from './ResearchWritingPdfPane'

const record: ExperimentRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Paper',
  projectId: null,
  workspaceId: 'workspace',
  workspacePath: '/research/project',
  hostId: 'runtime:research',
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
  manuscript: { sourcePath: 'main.tex', pdfPath: 'main.pdf' }
}

afterEach(() => {
  cleanup()
  mocks.openManuscriptPdf.mockReset()
  mocks.release.mockReset()
})

function pdfSource(key: string) {
  const bytes = new TextEncoder().encode('%PDF-')
  return {
    key,
    size: 5,
    mtime: 1,
    bytes,
    ranged: null,
    whole: async () => bytes,
    release: mocks.release
  }
}

it('keeps rendered PDF pages when unrelated experiment fields change', async () => {
  mocks.openManuscriptPdf.mockImplementation(
    async (_owner: unknown, file: { relativePath: string }) => pdfSource(file.relativePath)
  )
  const rootFile = { absolutePath: '/research/project/main.tex', relativePath: 'main.tex' }
  const view = render(
    <ResearchWritingPdfPane experiment={record} rootFile={rootFile} visible={true} />
  )
  await waitFor(() => expect(mocks.openManuscriptPdf).toHaveBeenCalledTimes(1))
  const renderedPage = await screen.findByText('PDF page')

  view.rerender(
    <ResearchWritingPdfPane
      experiment={{ ...record, updatedAt: '2026-10-24T00:00:00Z' }}
      rootFile={rootFile}
      visible={true}
    />
  )
  expect(mocks.openManuscriptPdf).toHaveBeenCalledTimes(1)
  expect(screen.getByText('PDF page')).toBe(renderedPage)

  view.rerender(
    <ResearchWritingPdfPane
      experiment={{ ...record, manuscript: { sourcePath: 'main.tex', pdfPath: 'revised.pdf' } }}
      rootFile={rootFile}
      visible={true}
    />
  )
  await waitFor(() => expect(mocks.openManuscriptPdf).toHaveBeenCalledTimes(2))
  // Why: the replaced PDF's download pauses once nothing shows it.
  expect(mocks.release).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(mocks.release).toHaveBeenCalledTimes(2)
})
