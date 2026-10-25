import { describe, expect, it } from 'vitest'
import { experimentSchema } from '../../../../shared/research/research-records'
import type { ManuscriptSelection } from '@/components/editor/manuscript-selection-revision'
import { writingAgentEditBlocker } from './research-writing-agent-edit-guard'

const experiment = experimentSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Paper',
  projectId: null,
  workspaceId: 'workspace-1',
  workspacePath: '/research/project',
  hostId: 'local',
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z'
})
const selection: ManuscriptSelection = {
  filePath: '/research/project/paper/main.tex',
  relativePath: 'paper/main.tex',
  startLine: 2,
  startColumn: 1,
  endLine: 3,
  endColumn: 5,
  selectedText: 'A finding.'
}
const cleanView = {
  worktreeId: experiment.workspaceId,
  filePath: selection.filePath,
  modelDirty: false
}

describe('Writing source edit guard', () => {
  it('allows a clean linked TeX file, including one not currently open', () => {
    expect(writingAgentEditBlocker({ experiment, selection, editorViews: [cleanView] })).toBeNull()
    expect(writingAgentEditBlocker({ experiment, selection, editorViews: [] })).toBeNull()
  })

  it('blocks dirty buffers and changed-on-disk conflicts without touching their drafts', () => {
    expect(
      writingAgentEditBlocker({
        experiment,
        selection,
        editorViews: [{ ...cleanView, modelDirty: true }]
      })
    ).toMatch(/Save or discard unsaved/)
    expect(
      writingAgentEditBlocker({
        experiment,
        selection,
        editorViews: [{ ...cleanView, externalMutation: 'changed' }]
      })
    ).toMatch(/changed-on-disk/)
    expect(
      writingAgentEditBlocker({
        experiment,
        selection,
        editorViews: [{ ...cleanView, pendingOwnerMigration: true }]
      })
    ).toMatch(/changing hosts/)
  })

  it('rejects a file outside the workspace or a selection no longer naming that file', () => {
    expect(
      writingAgentEditBlocker({
        experiment,
        selection: { ...selection, relativePath: '../other/main.tex' },
        editorViews: []
      })
    ).toMatch(/inside this Experiment workspace/)
    expect(
      writingAgentEditBlocker({
        experiment,
        selection: { ...selection, filePath: '/research/project/paper/other.tex' },
        editorViews: []
      })
    ).toMatch(/no longer matches/)
  })

  it('ignores a dirty view of another workspace', () => {
    expect(
      writingAgentEditBlocker({
        experiment,
        selection,
        editorViews: [{ ...cleanView, worktreeId: 'other-workspace', modelDirty: true }]
      })
    ).toBeNull()
  })
})
