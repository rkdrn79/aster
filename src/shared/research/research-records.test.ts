import { describe, expect, it } from 'vitest'
import { emptyResearchDocument, experimentSchema, researchDocumentSchema } from './research-records'

const baseExperiment = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Manuscript study',
  projectId: null,
  workspaceId: 'workspace',
  workspacePath: '/research/project',
  hostId: 'local',
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z'
}

describe('Experiment manuscript metadata', () => {
  it('loads an existing Experiment without a manuscript', () => {
    expect(experimentSchema.safeParse(baseExperiment).success).toBe(true)
  })

  it('keeps the optional Writing chat binding without requiring it in old records', () => {
    const oldDocument = { ...emptyResearchDocument(), experiments: [baseExperiment] }
    expect(
      researchDocumentSchema.parse(oldDocument).experiments[0].writingAgentSessionId
    ).toBeUndefined()
    expect(
      researchDocumentSchema.parse({
        ...oldDocument,
        experiments: [{ ...baseExperiment, writingAgentSessionId: 'session-writing-1' }]
      }).experiments[0].writingAgentSessionId
    ).toBe('session-writing-1')
    expect(
      experimentSchema.safeParse({ ...baseExperiment, writingAgentSessionId: ' ' }).success
    ).toBe(false)
  })

  it('accepts relative LaTeX and PDF paths in its workspace', () => {
    expect(
      experimentSchema.safeParse({
        ...baseExperiment,
        manuscript: { sourcePath: 'paper/main.tex', pdfPath: 'paper/main.pdf' }
      }).success
    ).toBe(true)
    expect(
      experimentSchema.safeParse({
        ...baseExperiment,
        workspacePath: 'C:\\research\\project',
        manuscript: { sourcePath: 'paper\\main.tex', pdfPath: null }
      }).success
    ).toBe(true)
  })

  it.each([
    { sourcePath: '../other/main.tex', pdfPath: null },
    { sourcePath: '/research/project/main.tex', pdfPath: null },
    { sourcePath: 'C:\\other\\main.tex', pdfPath: null },
    { sourcePath: 'paper/main.md', pdfPath: null },
    { sourcePath: 'paper/main.tex', pdfPath: '../../other/main.pdf' }
  ])('rejects an invalid manuscript source: %j', (manuscript) => {
    expect(experimentSchema.safeParse({ ...baseExperiment, manuscript }).success).toBe(false)
  })
})

describe('Experiment literature records', () => {
  const paper = {
    id: '00000000-0000-4000-8000-000000000002',
    experimentId: baseExperiment.id,
    title: 'A research paper',
    authors: 'A. Researcher and B. Scientist',
    year: 2026,
    doi: '10.1000/example',
    notes: 'Relevant baseline',
    pdfPath: 'papers/reference.pdf',
    externalUrl: 'https://example.org/reference',
    createdAt: '2026-10-23T00:00:00Z'
  }

  it('loads a pre-library research document with an empty paper list', () => {
    const {
      papers: _papers,
      selectedExperimentByWorkspace: _selection,
      ...oldDocument
    } = emptyResearchDocument()
    expect(researchDocumentSchema.parse(oldDocument).papers).toEqual([])
    expect(researchDocumentSchema.parse(oldDocument).selectedExperimentByWorkspace).toEqual({})
  })

  it('accepts a PDF inside the owning Experiment workspace', () => {
    const document = { ...emptyResearchDocument(), experiments: [baseExperiment], papers: [paper] }
    expect(researchDocumentSchema.safeParse(document).success).toBe(true)
    expect(
      researchDocumentSchema.safeParse({
        ...document,
        experiments: [{ ...baseExperiment, workspacePath: 'C:\\research\\project' }],
        papers: [{ ...paper, pdfPath: 'papers\\reference.pdf' }]
      }).success
    ).toBe(true)
  })

  it.each(['../other/reference.pdf', '/research/project/reference.pdf', 'papers/reference.tex'])(
    'rejects an invalid PDF path: %s',
    (pdfPath) => {
      const document = {
        ...emptyResearchDocument(),
        experiments: [baseExperiment],
        papers: [{ ...paper, pdfPath }]
      }
      expect(researchDocumentSchema.safeParse(document).success).toBe(false)
    }
  )

  it('rejects missing owners, duplicate IDs, and non-web external URLs', () => {
    const document = { ...emptyResearchDocument(), experiments: [baseExperiment], papers: [paper] }
    expect(researchDocumentSchema.safeParse({ ...document, papers: [paper, paper] }).success).toBe(
      false
    )
    expect(researchDocumentSchema.safeParse({ ...document, experiments: [] }).success).toBe(false)
    expect(
      researchDocumentSchema.safeParse({
        ...document,
        papers: [{ ...paper, externalUrl: 'javascript:alert(1)' }]
      }).success
    ).toBe(false)
  })
})

describe('workspace-scoped Experiment selection', () => {
  it('keeps a selection linked to its actual host and workspace', () => {
    const scope = JSON.stringify(['local', 'workspace'])
    const document = {
      ...emptyResearchDocument(),
      experiments: [baseExperiment],
      selectedExperimentByWorkspace: { [scope]: baseExperiment.id }
    }
    expect(researchDocumentSchema.safeParse(document).success).toBe(true)
    expect(
      researchDocumentSchema.safeParse({
        ...document,
        selectedExperimentByWorkspace: { [JSON.stringify(['local', 'other'])]: baseExperiment.id }
      }).success
    ).toBe(false)
  })
})

describe('delegated agent work', () => {
  const delegation = {
    id: '00000000-0000-4000-8000-000000000003',
    sourceWorkspaceId: 'local-workspace',
    sourceHostId: 'local',
    sourceExperimentId: baseExperiment.id,
    targetWorkspaceId: 'remote-workspace',
    targetHostId: 'runtime:remote',
    targetLabel: 'Lab computer',
    agent: 'claude',
    task: 'Review the ablation results',
    tabId: null,
    sessionId: null,
    state: 'launching',
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z'
  }

  it('loads old research records without delegation metadata', () => {
    const { delegations: _old, ...oldDocument } = emptyResearchDocument()
    expect(researchDocumentSchema.parse(oldDocument).delegations).toEqual([])
  })

  it('keeps the source and destination host identities and refuses a missing experiment', () => {
    const document = {
      ...emptyResearchDocument(),
      experiments: [baseExperiment],
      delegations: [delegation]
    }
    expect(researchDocumentSchema.parse(document).delegations[0].targetHostId).toBe(
      'runtime:remote'
    )
    expect(researchDocumentSchema.safeParse({ ...document, experiments: [] }).success).toBe(false)
    expect(
      researchDocumentSchema.safeParse({ ...document, delegations: [delegation, delegation] })
        .success
    ).toBe(false)
  })
})
