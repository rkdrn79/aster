import { describe, expect, it } from 'vitest'
import {
  emptyResearchDocument,
  researchDocumentSchema,
  type ResearchDocument
} from './research-records'
import { selectResearchExperiment, selectResearchRun } from './research-selection'

const ids = {
  first: '00000000-0000-4000-8000-000000000001',
  second: '00000000-0000-4000-8000-000000000002',
  firstRun: '00000000-0000-4000-8000-000000000003',
  lastRun: '00000000-0000-4000-8000-000000000004',
  otherRun: '00000000-0000-4000-8000-000000000005'
}

function fixture(): ResearchDocument {
  const now = '2026-10-22T10:00:00Z'
  const experiments = [ids.first, ids.second].map((id, index) => ({
    id,
    name: `Experiment ${index + 1}`,
    projectId: null,
    workspaceId: 'workspace',
    workspacePath: '/workspace',
    hostId: 'local',
    archived: false,
    createdAt: now,
    updatedAt: now
  }))
  const runs = [
    { id: ids.firstRun, experimentId: ids.first },
    { id: ids.lastRun, experimentId: ids.first },
    { id: ids.otherRun, experimentId: ids.second }
  ].map(({ id, experimentId }) => ({
    id,
    experimentId,
    name: id,
    hostId: 'local',
    workspaceId: 'workspace',
    workspacePath: '/workspace',
    sourcePath: `/workspace/${id}.jsonl`,
    format: 'jsonl' as const,
    logPath: null,
    configPath: null,
    execution: 'unknown' as const,
    reportedBy: 'unavailable' as const,
    observedAt: null,
    createdAt: now
  }))
  return {
    ...emptyResearchDocument(),
    experiments,
    runs,
    selectedExperimentId: ids.first,
    selectedRunId: ids.firstRun
  }
}

describe('research selection', () => {
  it('restores the last selected Run for each Experiment', () => {
    let document = fixture()
    document = selectResearchRun(document, ids.lastRun)
    document = selectResearchExperiment(document, ids.second)
    expect(document.selectedRunId).toBe(ids.otherRun)
    document = selectResearchExperiment(document, ids.first)
    expect(document.selectedRunId).toBe(ids.lastRun)
    expect(researchDocumentSchema.parse(document).experiments[0]?.lastSelectedRunId).toBe(
      ids.lastRun
    )
  })

  it('rejects a last Run linked to a different Experiment', () => {
    const document = fixture()
    document.experiments[0] = { ...document.experiments[0]!, lastSelectedRunId: ids.otherRun }
    expect(researchDocumentSchema.safeParse(document).success).toBe(false)
  })

  it('does not select a Run outside the active Experiment', () => {
    const document = fixture()
    expect(selectResearchRun(document, ids.otherRun)).toBe(document)
  })
})
