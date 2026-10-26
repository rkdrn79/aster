import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyResearchDocument,
  type ResearchDocument
} from '../../../../shared/research/research-records'
import { catalogExperimentKey } from '../../../../shared/research/research-experiment-delete'
import type { ProjectCatalog } from './research-project-catalog'

const context = {
  hostId: 'local' as const,
  workspaceId: 'workspace',
  workspacePath: '/project',
  projectId: null,
  projectName: null,
  workspaceName: null,
  hostLabel: null
}
const mocks = vi.hoisted(() => ({ state: { document: null as ResearchDocument | null } }))

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('./research-workspace-context', () => ({ selectResearchWorkspaceContext: () => context }))
vi.mock('./research-records-store', () => ({
  useResearchRecords: {
    getState: () => ({
      document: mocks.state.document,
      update: async (change: (current: ResearchDocument) => ResearchDocument) => {
        if (mocks.state.document) {
          mocks.state.document = change(mocks.state.document)
        }
      }
    })
  }
}))

const catalog: ProjectCatalog = {
  schemaVersion: 2,
  manuscript: { source: 'paper/main.tex', pdf: null },
  experiments: [
    { slug: 'removed', name: 'Removed', path: '.aster/experiments/removed', runs: [] },
    { slug: 'new', name: 'New', path: '.aster/experiments/new', runs: [] }
  ]
}

const { importCatalogExperimentRecord, syncCatalogExperimentRecords } =
  await import('./research-experiment-catalog-import')

describe('catalog Experiment removal', () => {
  beforeEach(() => {
    mocks.state.document = {
      ...emptyResearchDocument(),
      removedCatalogExperimentKeys: [catalogExperimentKey('local', 'workspace', 'removed')]
    }
  })

  it('does not restore a deleted Experiment while importing other new catalog entries', async () => {
    await syncCatalogExperimentRecords(context, catalog)
    expect(mocks.state.document?.experiments.map((experiment) => experiment.catalogSlug)).toEqual([
      'new'
    ])
    await syncCatalogExperimentRecords(context, catalog)
    expect(mocks.state.document?.experiments).toHaveLength(1)
  })

  it('allows an explicit import of the removed Experiment', async () => {
    await importCatalogExperimentRecord(context, catalog, catalog.experiments[0])
    expect(mocks.state.document?.experiments[0].catalogSlug).toBe('removed')
    expect(mocks.state.document?.removedCatalogExperimentKeys).toEqual([])
  })
})
