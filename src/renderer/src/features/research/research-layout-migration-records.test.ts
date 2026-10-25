import { describe, expect, it, vi } from 'vitest'
import { emptyResearchLibraryDocument } from '../../../../shared/research/research-library'
import type { ResearchDocument } from '../../../../shared/research/research-records'

vi.mock('./research-library-store', () => ({ useResearchLibrary: { getState: vi.fn() } }))
vi.mock('./research-records-store', () => ({ useResearchRecords: { getState: vi.fn() } }))

const { migratedLibraryDocument, migratedResearchDocument } =
  await import('./research-layout-migration-records')

const workspace = { hostId: 'local', workspacePath: '/p' }
const moves = [
  { from: 'research/experiments', to: '.aster/experiments' },
  { from: 'research/manuscript', to: 'paper' },
  { from: 'research/references/papers', to: '.aster/library/papers' }
]
const experimentId = '00000000-0000-4000-8000-000000000001'
const runDir = '/p/research/experiments/main/runs/seed-1'

function document(): ResearchDocument {
  const base = {
    id: experimentId,
    name: 'Main',
    projectId: null,
    workspaceId: 'w',
    workspacePath: '/p',
    hostId: 'local',
    archived: false,
    manuscript: { sourcePath: 'research/manuscript/main.tex', pdfPath: null },
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z'
  }
  const run = {
    id: '00000000-0000-4000-8000-000000000002',
    experimentId,
    name: 'seed 1',
    hostId: 'local',
    workspaceId: 'w',
    workspacePath: '/p',
    sourcePath: `${runDir}/metrics.jsonl`,
    format: 'jsonl' as const,
    logPath: `${runDir}/train.log`,
    configPath: null,
    manifestPath: `${runDir}/run.json`,
    execution: 'unknown' as const,
    reportedBy: 'unavailable' as const,
    observedAt: null,
    createdAt: '2026-10-24T00:00:00Z'
  }
  return {
    schemaVersion: 1,
    revision: 0,
    experiments: [base, { ...base, id: '00000000-0000-4000-8000-000000000003', hostId: 'ssh-gpu' }],
    runs: [run, { ...run, id: '00000000-0000-4000-8000-000000000004', hostId: 'ssh-gpu' }],
    detachedCatalogRunSourceKeys: [JSON.stringify(['local', 'w', `${runDir}/metrics.jsonl`])],
    papers: [],
    delegations: [],
    conversationExperimentIds: {},
    conversationHomes: {},
    selectedExperimentByWorkspace: {},
    selectedExperimentId: null,
    selectedRunId: null,
    comparisonRunIds: [],
    baselineRunId: null
  }
}

describe('records after a layout migration', () => {
  it('moves this workspace’s Run, manuscript and detached paths, and no other host’s', () => {
    const next = migratedResearchDocument(document(), workspace, moves)
    expect(next.runs[0]).toMatchObject({
      sourcePath: '/p/.aster/experiments/main/runs/seed-1/metrics.jsonl',
      logPath: '/p/.aster/experiments/main/runs/seed-1/train.log',
      manifestPath: '/p/.aster/experiments/main/runs/seed-1/run.json',
      configPath: null
    })
    expect(next.runs[1].sourcePath).toBe(`${runDir}/metrics.jsonl`)
    expect(next.experiments[0].manuscript?.sourcePath).toBe('paper/main.tex')
    expect(next.experiments[1].manuscript?.sourcePath).toBe('research/manuscript/main.tex')
    expect(JSON.parse(next.detachedCatalogRunSourceKeys[0])[2]).toBe(
      '/p/.aster/experiments/main/runs/seed-1/metrics.jsonl'
    )
  })

  it('moves Library PDFs of the migrated workspace only', () => {
    const paper = {
      id: '00000000-0000-4000-8000-000000000010',
      scope: { hostId: 'local', workspaceId: 'w', workspacePath: '/p' },
      title: 'A paper',
      pdfPath: 'research/references/papers/a.pdf',
      tags: [],
      status: 'unread' as const,
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z'
    }
    const library = {
      ...emptyResearchLibraryDocument(),
      papers: [
        paper,
        {
          ...paper,
          id: '00000000-0000-4000-8000-000000000011',
          scope: { ...paper.scope, workspacePath: '/q' }
        }
      ]
    }
    const next = migratedLibraryDocument(library, workspace, moves)
    expect(next.papers.map((item) => item.pdfPath)).toEqual([
      '.aster/library/papers/a.pdf',
      'research/references/papers/a.pdf'
    ])
  })
})
