import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyResearchDocument,
  type ExperimentRecord,
  type ResearchDocument
} from '../../../../shared/research/research-records'
import type { ProjectCatalog } from './research-project-catalog'
import {
  catalogRunCandidate,
  catalogRunSourceKey,
  syncCatalogRunRecords
} from './research-catalog-run-import'
import { attachResearchRunRecord, detachResearchRun } from './research-run-record-links'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  manifest: vi.fn(),
  fileExists: vi.fn(),
  state: { document: null as ResearchDocument | null }
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('./research-workspace-context', () => ({
  selectResearchWorkspaceContext: () => ({
    hostId: 'local',
    workspaceId: 'workspace-1',
    workspacePath: '/tmp/project'
  })
}))
vi.mock('./research-source-reader', () => ({
  observeResearchRun: mocks.read,
  readResearchRunManifest: mocks.manifest
}))
vi.mock('./research-file-reader', () => ({ researchFileExists: mocks.fileExists }))
vi.mock('./research-records-store', () => ({
  useResearchRecords: {
    getState: () => ({
      document: mocks.state.document,
      update: async (change: (document: ResearchDocument) => ResearchDocument) => {
        if (mocks.state.document) {
          mocks.state.document = change(mocks.state.document)
        }
      }
    })
  }
}))

const experiment: ExperimentRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'LoRA r16',
  projectId: null,
  workspaceId: 'workspace-1',
  workspacePath: '/tmp/project',
  hostId: 'local',
  catalogSlug: 'lora-r16',
  archived: false,
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z'
}

const entry: ProjectCatalog['experiments'][number] = {
  slug: 'lora-r16',
  name: 'LoRA r16',
  path: 'research/experiments/lora-r16',
  runs: [
    {
      id: 'seed-42',
      name: 'Seed 42',
      manifest: 'research/experiments/lora-r16/runs/seed-42/run.json',
      metrics: 'research/experiments/lora-r16/runs/seed-42/metrics.jsonl',
      log: 'research/experiments/lora-r16/runs/seed-42/train.log',
      config: null
    }
  ]
}

describe('catalog Run import', () => {
  beforeEach(() => {
    mocks.read.mockReset()
    mocks.manifest.mockReset()
    mocks.fileExists.mockReset()
    mocks.fileExists.mockResolvedValue(false)
    mocks.state.document = { ...emptyResearchDocument(), experiments: [experiment] }
    mocks.read.mockResolvedValue({
      events: [{ x: 1, metric: 'loss', split: 'train', value: 1.25 }],
      errorRows: 0,
      incompleteLastLine: false,
      observedAt: '2026-10-24T01:00:00Z',
      sourceRunId: 'seed-42',
      sourceAnchor: null,
      csvSelectedXColumn: null,
      csvSelectedMetricColumns: []
    })
    mocks.manifest.mockResolvedValue({ schemaVersion: 1, externalRunId: 'seed-42' })
  })

  it('binds a canonical catalog Run to its Experiment without asserting success', () => {
    const run = catalogRunCandidate(experiment, entry, entry.runs[0])
    expect(run).toMatchObject({
      experimentId: experiment.id,
      hostId: 'local',
      sourcePath: '/tmp/project/research/experiments/lora-r16/runs/seed-42/metrics.jsonl',
      execution: 'unknown',
      reportedBy: 'unavailable'
    })
  })

  it('binds a Run kept in the .aster record tree', () => {
    const moved = (path: string): string =>
      path.replace('research/experiments/', '.aster/experiments/')
    const aster: ProjectCatalog['experiments'][number] = {
      ...entry,
      path: moved(entry.path),
      runs: entry.runs.map((run) => ({
        ...run,
        manifest: moved(run.manifest),
        metrics: moved(run.metrics),
        log: run.log ? moved(run.log) : null,
        config: run.config ? moved(run.config) : null
      }))
    }
    expect(catalogRunCandidate(experiment, aster, aster.runs[0]).sourcePath).toBe(
      '/tmp/project/.aster/experiments/lora-r16/runs/seed-42/metrics.jsonl'
    )
    const mixed = { ...aster, path: 'research/experiments/lora-r16' }
    expect(() => catalogRunCandidate(experiment, mixed, aster.runs[0])).toThrow(
      'Run files are outside the expected run folder'
    )
  })

  it('rejects a catalog entry that points at another Run or directory', () => {
    expect(() =>
      catalogRunCandidate(experiment, entry, {
        ...entry.runs[0],
        metrics: 'research/experiments/lora-r16/runs/another/metrics.jsonl'
      })
    ).toThrow('Run files')
    expect(() =>
      catalogRunCandidate(experiment, { ...entry, path: 'research/other' }, entry.runs[0])
    ).toThrow('Run files')
  })

  it('imports a catalog Run once without changing selection', async () => {
    const catalog: ProjectCatalog = {
      schemaVersion: 1,
      manuscript: { source: 'research/manuscript/main.tex', pdf: null },
      experiments: [entry]
    }
    const context = {
      hostId: 'local' as const,
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/project',
      projectId: null,
      projectName: null,
      workspaceName: null,
      hostLabel: null
    }
    expect(await syncCatalogRunRecords(context, catalog)).toEqual([])
    expect(mocks.state.document?.runs).toHaveLength(1)
    expect(mocks.state.document?.runs[0]).toMatchObject({
      experimentId: experiment.id,
      sourceRunId: 'seed-42',
      execution: 'unknown'
    })
    expect(mocks.state.document?.selectedExperimentId).toBeNull()
    expect(await syncCatalogRunRecords(context, catalog)).toEqual([])
    expect(mocks.state.document?.runs).toHaveLength(1)
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })

  it('leaves a mismatched result unattached and reports it', async () => {
    mocks.manifest.mockResolvedValue({ schemaVersion: 1, externalRunId: 'other-run' })
    const issues = await syncCatalogRunRecords(
      {
        hostId: 'local',
        workspaceId: 'workspace-1',
        workspacePath: '/tmp/project',
        projectId: null,
        projectName: null,
        workspaceName: null,
        hostLabel: null
      },
      {
        schemaVersion: 1,
        manuscript: { source: 'research/manuscript/main.tex', pdf: null },
        experiments: [entry]
      }
    )
    expect(issues).toHaveLength(1)
    expect(mocks.state.document?.runs).toHaveLength(0)
  })

  it('honors a user-detached catalog source on later scans', async () => {
    const candidate = catalogRunCandidate(experiment, entry, entry.runs[0])
    if (!mocks.state.document) {
      throw new Error('Missing test document')
    }
    mocks.state.document.detachedCatalogRunSourceKeys = [catalogRunSourceKey(candidate)]
    const issues = await syncCatalogRunRecords(
      {
        hostId: 'local',
        workspaceId: 'workspace-1',
        workspacePath: '/tmp/project',
        projectId: null,
        projectName: null,
        workspaceName: null,
        hostLabel: null
      },
      {
        schemaVersion: 1,
        manuscript: { source: 'research/manuscript/main.tex', pdf: null },
        experiments: [entry]
      }
    )
    expect(issues).toEqual([])
    expect(mocks.state.document.runs).toHaveLength(0)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('keeps a detached Run absent until it is explicitly attached again', () => {
    const run = catalogRunCandidate(experiment, entry, entry.runs[0])
    const document = {
      ...emptyResearchDocument(),
      experiments: [experiment],
      selectedExperimentId: experiment.id,
      runs: [run]
    }
    const detached = detachResearchRun(document, run.id)
    expect(detached.runs).toEqual([])
    expect(detached.detachedCatalogRunSourceKeys).toContain(catalogRunSourceKey(run))
    const restored = attachResearchRunRecord(detached, run)
    expect(restored.runs).toHaveLength(1)
    expect(restored.detachedCatalogRunSourceKeys).toEqual([])
  })

  it('links the Run folder outputs.jsonl unless the user already chose or cleared a path', async () => {
    const folder = (id: string): ProjectCatalog['experiments'][number]['runs'][number] => ({
      id,
      name: id,
      manifest: `research/experiments/lora-r16/runs/${id}/run.json`,
      metrics: `research/experiments/lora-r16/runs/${id}/metrics.jsonl`,
      log: null,
      config: null
    })
    const withOutputs = { ...entry, runs: [folder('seed-7'), folder('seed-8')] }
    const unset = catalogRunCandidate(experiment, withOutputs, withOutputs.runs[0])
    const cleared = {
      ...catalogRunCandidate(experiment, withOutputs, withOutputs.runs[1]),
      outputsPath: null
    }
    mocks.state.document = {
      ...emptyResearchDocument(),
      experiments: [experiment],
      runs: [unset, cleared]
    }
    mocks.fileExists.mockResolvedValue(true)
    await syncCatalogRunRecords(
      {
        hostId: 'local',
        workspaceId: 'workspace-1',
        workspacePath: '/tmp/project',
        projectId: null,
        projectName: null,
        workspaceName: null,
        hostLabel: null
      },
      {
        schemaVersion: 1,
        manuscript: { source: 'research/manuscript/main.tex', pdf: null },
        experiments: [withOutputs]
      }
    )
    expect(mocks.fileExists).toHaveBeenCalledTimes(1)
    expect(mocks.state.document?.runs.map((run) => run.outputsPath)).toEqual([
      '/tmp/project/research/experiments/lora-r16/runs/seed-7/outputs.jsonl',
      null
    ])
  })

  it('re-checks a missing outputs.jsonl only after the retry window', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T00:00:00Z') })
    try {
      const run = {
        ...entry.runs[0],
        id: 'seed-9',
        manifest: 'research/experiments/lora-r16/runs/seed-9/run.json',
        metrics: 'research/experiments/lora-r16/runs/seed-9/metrics.jsonl',
        log: null
      }
      const catalog: ProjectCatalog = {
        schemaVersion: 1,
        manuscript: { source: 'research/manuscript/main.tex', pdf: null },
        experiments: [{ ...entry, runs: [run] }]
      }
      mocks.state.document = {
        ...emptyResearchDocument(),
        experiments: [experiment],
        runs: [catalogRunCandidate(experiment, catalog.experiments[0], run)]
      }
      const context: Parameters<typeof syncCatalogRunRecords>[0] = {
        hostId: 'local',
        workspaceId: 'workspace-1',
        workspacePath: '/tmp/project',
        projectId: null,
        projectName: null,
        workspaceName: null,
        hostLabel: null
      }
      await syncCatalogRunRecords(context, catalog)
      await syncCatalogRunRecords(context, catalog)
      expect(mocks.fileExists).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(61_000)
      await syncCatalogRunRecords(context, catalog)
      expect(mocks.fileExists).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
