import { detectLanguage } from '@/lib/language-detect'
import { useAppStore } from '@/store'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { openResearchView } from './research-navigation'
import { openEditorForWriting } from './research-writing-editor-ownership'
import type { ManuscriptFile } from './research-writing-source'

export function openManuscriptInEditor(
  experiment: ExperimentRecord,
  file: ManuscriptFile,
  besidePdf?: ManuscriptFile | null
): string | null {
  const host = parseExecutionHostId(experiment.hostId)
  if (!host) {
    return 'The Experiment host is unavailable.'
  }
  const state = useAppStore.getState()
  if (!state.setActiveWorktree(experiment.workspaceId, host.id)) {
    return 'Could not open the linked workspace.'
  }
  const existingTabs = state.unifiedTabsByWorktree[experiment.workspaceId] ?? []
  const sourceTab = existingTabs.find(
    (tab) => tab.contentType === 'editor' && tab.entityId === file.absolutePath
  )
  const groupId =
    sourceTab?.groupId ??
    state.activeGroupIdByWorktree[experiment.workspaceId] ??
    state.ensureWorktreeRootGroup(experiment.workspaceId)
  state.openFile(
    {
      filePath: file.absolutePath,
      relativePath: file.relativePath,
      worktreeId: experiment.workspaceId,
      language: detectLanguage(file.absolutePath),
      mode: 'edit'
    },
    { preview: false, focusEditor: true, targetGroupId: groupId }
  )
  if (besidePdf) {
    const pdfTab = existingTabs.find(
      (tab) =>
        tab.contentType === 'editor' &&
        tab.entityId === besidePdf.absolutePath &&
        tab.groupId !== groupId
    )
    const pdfGroupId =
      pdfTab?.groupId ?? state.createEmptySplitGroup(experiment.workspaceId, groupId, 'right')
    if (pdfGroupId) {
      state.openFile(
        {
          filePath: besidePdf.absolutePath,
          relativePath: besidePdf.relativePath,
          worktreeId: experiment.workspaceId,
          language: detectLanguage(besidePdf.absolutePath),
          mode: 'edit'
        },
        { preview: false, targetGroupId: pdfGroupId }
      )
      state.focusGroup(experiment.workspaceId, groupId)
    }
  }
  state.setActiveTabType('editor', experiment.workspaceId)
  openResearchView('terminal')
  return null
}

/** Open the existing editor buffer for the Writing surface without leaving that surface. */
export function openManuscriptForWriting(
  experiment: ExperimentRecord,
  file: ManuscriptFile
): { fileId: string; tabId: string } | { error: string } {
  const host = parseExecutionHostId(experiment.hostId)
  if (!host) {
    return { error: 'The Experiment host is unavailable.' }
  }
  const state = useAppStore.getState()
  if (!state.setActiveWorktree(experiment.workspaceId, host.id)) {
    return { error: 'Could not open the linked workspace.' }
  }
  const tabsBefore = useAppStore.getState().unifiedTabsByWorktree[experiment.workspaceId] ?? []
  const existing = tabsBefore.find(
    (tab) => tab.contentType === 'editor' && tab.entityId === file.absolutePath
  )
  const groupId =
    existing?.groupId ??
    state.activeGroupIdByWorktree[experiment.workspaceId] ??
    state.ensureWorktreeRootGroup(experiment.workspaceId)
  const fileId = openEditorForWriting(tabsBefore, experiment.workspaceId, () =>
    state.openFile(
      {
        filePath: file.absolutePath,
        relativePath: file.relativePath,
        worktreeId: experiment.workspaceId,
        language: detectLanguage(file.absolutePath),
        mode: 'edit'
      },
      // Why 'none': Writing shows the buffer itself; the Workbench keeps its selected tab.
      { preview: false, focusEditor: false, targetGroupId: groupId, selection: 'none' }
    )
  )
  const tab = (useAppStore.getState().unifiedTabsByWorktree[experiment.workspaceId] ?? []).find(
    (entry) => entry.contentType === 'editor' && entry.entityId === fileId
  )
  // A layout-owner window may publish the tab asynchronously; the editor buffer already has an id.
  return { fileId, tabId: tab?.id ?? existing?.id ?? fileId }
}
