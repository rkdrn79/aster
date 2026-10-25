import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { ManuscriptSelection } from '@/components/editor/manuscript-selection-revision'
import { resolveManuscriptFile } from './research-writing-source'

export type WritingSourceEditorView = {
  worktreeId: string
  filePath: string
  modelDirty: boolean
  externalMutation?: 'deleted' | 'renamed' | 'changed'
  pendingOwnerMigration?: boolean
}

/** A coding agent must never race an unsaved or conflicted manuscript buffer on disk. */
export function writingAgentEditBlocker(input: {
  experiment: ExperimentRecord
  selection: ManuscriptSelection
  editorViews: readonly WritingSourceEditorView[]
}): string | null {
  try {
    const source = resolveManuscriptFile(input.experiment, input.selection.relativePath, '.tex')
    if (source.absolutePath !== input.selection.filePath) {
      return 'The selected TeX file no longer matches the linked workspace. Reopen it before revising.'
    }
  } catch {
    return 'Choose a TeX file inside this Experiment workspace before revising.'
  }
  const views = input.editorViews.filter(
    (file) =>
      file.worktreeId === input.experiment.workspaceId && file.filePath === input.selection.filePath
  )
  if (views.some((file) => file.modelDirty)) {
    return 'Save or discard unsaved TeX changes before asking the agent to edit this passage.'
  }
  if (views.some((file) => file.externalMutation === 'changed')) {
    return 'Resolve the changed-on-disk TeX conflict before asking the agent to edit this passage.'
  }
  if (views.some((file) => file.pendingOwnerMigration)) {
    return 'The TeX file is changing hosts. Wait for the editor to reconnect before revising.'
  }
  return null
}
