import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { isWritingTeXFile, resolveManuscriptFile } from './research-writing-source'

const fileRead = vi.hoisted(() => ({
  stat: vi.fn(),
  range: vi.fn()
}))

vi.mock('@/runtime/runtime-client-target', () => ({
  runtimeRpcTargetForAuthorityKey: () => ({ kind: 'local' })
}))

vi.mock('@/runtime/runtime-file-range-client', () => ({
  statRuntimeReadTarget: fileRead.stat,
  readRuntimeFileRange: fileRead.range
}))

const experiment: ExperimentRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Paper',
  projectId: null,
  workspaceId: 'workspace',
  workspacePath: '/research/project',
  hostId: 'local',
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z'
}

describe('manuscript file boundary', () => {
  beforeEach(() => {
    fileRead.stat.mockReset()
    fileRead.range.mockReset()
  })

  it('normalizes an approved local picker path to a workspace-relative manuscript path', () => {
    expect(resolveManuscriptFile(experiment, '/research/project/paper/main.tex', '.tex')).toEqual({
      absolutePath: '/research/project/paper/main.tex',
      relativePath: 'paper/main.tex'
    })
    expect(resolveManuscriptFile(experiment, 'paper/main.pdf', '.pdf').relativePath).toBe(
      'paper/main.pdf'
    )
  })

  it('refuses traversal, another workspace, and the wrong file kind', () => {
    expect(() => resolveManuscriptFile(experiment, '../secret.tex', '.tex')).toThrow('inside')
    expect(() => resolveManuscriptFile(experiment, '/another/main.tex', '.tex')).toThrow('inside')
    expect(() => resolveManuscriptFile(experiment, 'paper/main.md', '.tex')).toThrow('.tex')
  })

  it('offers Writing revision for every TeX file in the linked workspace', () => {
    const manuscriptExperiment = {
      ...experiment,
      manuscript: { sourcePath: 'paper/main.tex', pdfPath: null }
    }
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'workspace',
        '/research/project/paper/main.tex',
        'paper/main.tex'
      )
    ).toBe(true)
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'workspace',
        '/research/project/paper/section.tex',
        'paper/section.tex'
      )
    ).toBe(true)
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'another-workspace',
        '/research/project/paper/section.tex',
        'paper/section.tex'
      )
    ).toBe(false)
    expect(
      isWritingTeXFile(
        manuscriptExperiment,
        'workspace',
        '/research/project/paper/notes.md',
        'paper/notes.md'
      )
    ).toBe(false)
  })
})
