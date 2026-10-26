import { describe, expect, it } from 'vitest'
import { emptyResearchDocument, researchDocumentSchema } from './research-records'
import { catalogExperimentKey, withoutResearchExperiment } from './research-experiment-delete'

const id = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const runId = '00000000-0000-4000-8000-000000000003'
const otherRunId = '00000000-0000-4000-8000-000000000004'

function fixture() {
  const now = '2026-10-26T00:00:00Z'
  const experiment = {
    id,
    name: 'Study',
    projectId: null,
    workspaceId: 'workspace',
    workspacePath: '/project',
    hostId: 'local',
    catalogSlug: 'study',
    archived: false,
    createdAt: now,
    updatedAt: now
  }
  const run = {
    id: runId,
    experimentId: id,
    name: 'Seed 1',
    hostId: 'local',
    workspaceId: 'workspace',
    workspacePath: '/project',
    sourcePath: '/project/.aster/experiments/study/runs/seed-1/metrics.jsonl',
    format: 'jsonl' as const,
    logPath: null,
    configPath: null,
    execution: 'succeeded' as const,
    reportedBy: 'manifest' as const,
    observedAt: now,
    createdAt: now
  }
  return researchDocumentSchema.parse({
    ...emptyResearchDocument(),
    experiments: [experiment, { ...experiment, id: otherId, catalogSlug: 'other' }],
    runs: [run, { ...run, id: otherRunId, experimentId: otherId }],
    papers: [
      {
        id: '00000000-0000-4000-8000-000000000005',
        experimentId: id,
        title: 'Paper',
        createdAt: now
      }
    ],
    delegations: [
      {
        id: '00000000-0000-4000-8000-000000000006',
        sourceWorkspaceId: 'workspace',
        sourceHostId: 'local',
        sourceExperimentId: id,
        targetWorkspaceId: 'workspace',
        targetHostId: 'local',
        targetLabel: 'Worker',
        agent: 'codex',
        task: 'Review',
        tabId: null,
        sessionId: null,
        state: 'ready',
        createdAt: now,
        updatedAt: now
      }
    ],
    conversationExperimentIds: { chat: id },
    conversationHomes: {
      chat: { kind: 'experiment', experimentId: id },
      writer: { kind: 'writing', experimentId: id }
    },
    selectedExperimentByWorkspace: { [JSON.stringify(['local', 'workspace'])]: id },
    selectedExperimentId: id,
    selectedRunId: runId,
    comparisonRunIds: [runId, otherRunId],
    baselineRunId: runId
  })
}

describe('Experiment deletion', () => {
  it('removes dependent Aster records and selection while keeping unrelated research valid', () => {
    const deleted = withoutResearchExperiment(fixture(), id)
    expect(researchDocumentSchema.safeParse(deleted).success).toBe(true)
    expect(deleted.experiments.map((experiment) => experiment.id)).toEqual([otherId])
    expect(deleted.runs.map((run) => run.id)).toEqual([otherRunId])
    expect(deleted.papers).toEqual([])
    expect(deleted.delegations[0].sourceExperimentId).toBeNull()
    expect(deleted.conversationExperimentIds.chat).toBeNull()
    expect(deleted.conversationHomes.chat).toBeUndefined()
    expect(deleted.conversationHomes.writer).toEqual({ kind: 'writing', experimentId: null })
    expect(deleted.selectedExperimentByWorkspace).toEqual({})
    expect(deleted.selectedExperimentId).toBeNull()
    expect(deleted.selectedRunId).toBeNull()
    expect(deleted.comparisonRunIds).toEqual([otherRunId])
    expect(deleted.baselineRunId).toBeNull()
    expect(deleted.removedCatalogExperimentKeys).toEqual([
      catalogExperimentKey('local', 'workspace', 'study')
    ])
  })
})
