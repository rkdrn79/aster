// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readProjectCatalog: vi.fn(),
  readCatalogManuscript: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  initialize: vi.fn().mockResolvedValue(undefined),
  createExperiment: vi.fn().mockResolvedValue({ slug: 'ablation' })
}))

vi.mock('@/store', () => ({ useAppStore: { getState: vi.fn() } }))
vi.mock('./research-records-store', () => ({
  useResearchRecords: { getState: () => ({ update: mocks.update }) }
}))
vi.mock('./research-project-catalog', () => ({ readProjectCatalog: mocks.readProjectCatalog }))
vi.mock('./research-writing-project', () => ({
  readCatalogManuscript: mocks.readCatalogManuscript
}))

import { createCatalogExperiment } from './research-experiment-catalog-import'

afterEach(() => {
  vi.unstubAllGlobals()
  for (const mock of Object.values(mocks)) {
    mock.mockClear()
  }
})

it('carries the existing main.tex into a new local catalog before adding an Experiment', async () => {
  vi.stubGlobal('window', {
    api: {
      researchProjectLayout: {
        initialize: mocks.initialize,
        createExperiment: mocks.createExperiment
      }
    }
  })
  mocks.readProjectCatalog.mockRejectedValueOnce(new Error('No catalog')).mockResolvedValueOnce({
    manuscript: { source: 'main.tex', pdf: null },
    experiments: [
      { slug: 'ablation', name: 'Ablation', path: '.aster/experiments/ablation', runs: [] }
    ]
  })
  mocks.readCatalogManuscript.mockResolvedValue({ sourcePath: 'main.tex', pdfPath: null })

  await createCatalogExperiment(
    {
      hostId: 'local',
      workspaceId: 'workspace-1',
      workspacePath: '/projects/paper',
      workspaceName: 'paper',
      projectId: null,
      projectName: 'Paper',
      hostLabel: 'Local Mac'
    },
    'Ablation'
  )

  expect(mocks.initialize).toHaveBeenCalledWith({
    workspacePath: '/projects/paper',
    manuscript: 'main.tex',
    createPaper: false
  })
  expect(mocks.initialize.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.createExperiment.mock.invocationCallOrder[0]
  )
})
