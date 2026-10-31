import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { canOpenMarkdownPreview } from '@/components/editor/markdown-preview-controls'
import { usePhoneNavigation } from './phone-navigation-store'

function showsFile(state: Pick<AppState, 'activeTabType'>): boolean {
  return state.activeTabType === 'editor' || state.activeTabType === 'browser'
}

/**
 * While the Files tab is on screen, a file the explorer or the paper list opens comes up full
 * screen in the workbench. The explorer opens files through the shared editor, so following the
 * store keeps its own open rules (previews, symlinks, owners) instead of re-implementing them.
 */
export function usePhoneFileOpenFollow(): void {
  useEffect(() => {
    const initial = useAppStore.getState()
    // Why: an editor left active from an earlier visit would make a repeat tap a no-op write.
    if (showsFile(initial) && initial.activeWorktreeId) {
      initial.setActiveTabType('terminal', initial.activeWorktreeId)
    }
    return useAppStore.subscribe((state, previous) => {
      const worktreeId = state.activeWorktreeId
      if (
        !worktreeId ||
        !showsFile(state) ||
        (state.activeTabType === previous.activeTabType &&
          state.activeFileId === previous.activeFileId &&
          state.activeBrowserTabId === previous.activeBrowserTabId)
      ) {
        return
      }
      const fileId = state.activeTabType === 'editor' ? state.activeFileId : null
      const file = fileId ? state.openFiles.find((entry) => entry.id === fileId) : undefined
      if (file && canOpenMarkdownPreview(file)) {
        // Why: a phone reads notes more than it edits them, so Markdown opens in the read-only
        // preview tab. Deferred: a write inside this listener would hand later listeners stale state.
        queueMicrotask(() =>
          useAppStore.getState().openMarkdownPreview(
            {
              filePath: file.filePath,
              relativePath: file.relativePath,
              worktreeId: file.worktreeId,
              runtimeEnvironmentId: file.runtimeEnvironmentId,
              externalSshTargetId: file.externalSshTargetId,
              language: file.language
            },
            { sourceFileId: file.id }
          )
        )
        return
      }
      const relativePath = file?.relativePath ?? ''
      const slash = relativePath.lastIndexOf('/')
      usePhoneNavigation.getState().push({
        kind: 'workbench',
        target: { kind: 'file', worktreeId, fileId },
        title: file ? relativePath.slice(slash + 1) || relativePath : 'Preview',
        subtitle: slash > 0 ? relativePath.slice(0, slash) : undefined
      })
    })
  }, [])
}
