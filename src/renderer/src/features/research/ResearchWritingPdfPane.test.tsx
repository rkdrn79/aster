// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'

const mocks = vi.hoisted(() => ({ readManuscriptPdf: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: (select: (state: { openFiles: [] }) => unknown) => select({ openFiles: [] })
}))
vi.mock('./research-writing-source', () => ({
  readManuscriptPdf: mocks.readManuscriptPdf,
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
  mocks.readManuscriptPdf.mockReset()
})

it('keeps rendered PDF pages when unrelated experiment fields change', async () => {
  mocks.readManuscriptPdf.mockResolvedValue({ base64: 'JVBERi0=', size: 5, mtime: 1 })
  const rootFile = { absolutePath: '/research/project/main.tex', relativePath: 'main.tex' }
  const view = render(
    <ResearchWritingPdfPane experiment={record} rootFile={rootFile} visible={true} />
  )
  await waitFor(() => expect(mocks.readManuscriptPdf).toHaveBeenCalledTimes(1))
  const renderedPage = await screen.findByText('PDF page')

  view.rerender(
    <ResearchWritingPdfPane
      experiment={{ ...record, updatedAt: '2026-10-24T00:00:00Z' }}
      rootFile={rootFile}
      visible={true}
    />
  )
  expect(mocks.readManuscriptPdf).toHaveBeenCalledTimes(1)
  expect(screen.getByText('PDF page')).toBe(renderedPage)

  view.rerender(
    <ResearchWritingPdfPane
      experiment={{ ...record, manuscript: { sourcePath: 'main.tex', pdfPath: 'revised.pdf' } }}
      rootFile={rootFile}
      visible={true}
    />
  )
  await waitFor(() => expect(mocks.readManuscriptPdf).toHaveBeenCalledTimes(2))
})
