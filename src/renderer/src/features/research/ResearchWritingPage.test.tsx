// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'

const mocks = vi.hoisted(() => ({
  experiments: new Array<ExperimentRecord>(),
  scope: {
    hostId: 'runtime:research',
    workspaceId: 'streaming-video',
    workspacePath: '/data/projects/ExamplePaper',
    projectId: null,
    workspaceName: 'ExamplePaper',
    projectName: 'ExamplePaper'
  },
  readWritingManuscript: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: () => mocks.scope }))
vi.mock('./research-workspace-context', () => ({
  selectResearchWorkspaceContext: () => mocks.scope
}))
vi.mock('./research-records-store', () => ({
  useResearchRecords: (
    select: (state: { document: { experiments: ExperimentRecord[] } }) => unknown
  ) => select({ document: { experiments: mocks.experiments } })
}))
vi.mock('./research-writing-project', () => ({
  writingOwnerExperiment: (experiments: ExperimentRecord[]) => experiments[0] ?? null,
  projectWritingRecord: (
    scope: typeof mocks.scope,
    manuscript: ExperimentRecord['manuscript']
  ) => ({
    id: 'project-writing',
    name: scope.projectName,
    ...scope,
    manuscript,
    archived: false,
    createdAt: '',
    updatedAt: ''
  }),
  readWritingManuscript: mocks.readWritingManuscript,
  readProjectPdfPath: () => null
}))
vi.mock('./ResearchWritingWorkspace', () => ({
  ResearchWritingWorkspace: ({
    record,
    projectOnly
  }: {
    record: ExperimentRecord
    projectOnly: boolean
  }) => (
    <div>{`${record.manuscript?.sourcePath ?? 'none'} · ${projectOnly ? 'project' : 'experiment'}`}</div>
  )
}))

import { ResearchWritingPage } from './ResearchWritingPage'

afterEach(() => {
  cleanup()
  mocks.experiments.length = 0
  mocks.readWritingManuscript.mockReset()
})

it('keeps the project main TeX visible when its first Experiment has no manuscript', async () => {
  mocks.readWritingManuscript.mockResolvedValue({ sourcePath: 'main.tex', pdfPath: null })
  const view = render(<ResearchWritingPage />)
  const source = await screen.findByText('main.tex · project')

  mocks.experiments.push({
    id: 'experiment-1',
    name: 'Ablation',
    projectId: null,
    workspaceId: mocks.scope.workspaceId,
    workspacePath: mocks.scope.workspacePath,
    hostId: mocks.scope.hostId,
    archived: false,
    createdAt: '2026-10-26T00:00:00Z',
    updatedAt: '2026-10-26T00:00:00Z'
  })
  view.rerender(<ResearchWritingPage />)

  expect(await screen.findByText('main.tex · experiment')).toBe(source)
})

it('shows a retryable Writing error after the project host disconnects', async () => {
  mocks.readWritingManuscript
    .mockRejectedValueOnce(new Error('The workspace host is unavailable.'))
    .mockResolvedValueOnce({ sourcePath: 'paper/main.tex', pdfPath: null })

  render(<ResearchWritingPage />)

  expect(await screen.findByText('Writing files unavailable')).toBeTruthy()
  expect(screen.getByText('The workspace host is unavailable.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('paper/main.tex · project')).toBeTruthy()
  expect(mocks.readWritingManuscript).toHaveBeenCalledTimes(2)
})

it('opens manuscript setup when the catalog and source are actually absent', async () => {
  mocks.readWritingManuscript.mockResolvedValue(undefined)

  render(<ResearchWritingPage />)

  expect(await screen.findByText('none · project')).toBeTruthy()
  expect(screen.queryByText('Writing files unavailable')).toBeNull()
})
