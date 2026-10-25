import { create } from 'zustand'
import type { Tab } from '../../../../shared/tab-types'
import { onEditorFileOpen } from '@/store/slices/editor/actions/editor-file-open-listeners'

// Why per device: tab layout is local, and restored Writing buffers must stay out of the Workbench.
const STORAGE_KEY = 'aster.research.writingEditors'
const MAX_KEYS = 500

function editorKey(worktreeId: string, fileId: string): string {
  return JSON.stringify([worktreeId, fileId])
}

function readStoredKeys(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : []
  } catch {
    return []
  }
}

/** Editor buffers Writing opened (worktree + file id) that the Workbench has not opened itself. */
export const useResearchWritingEditors = create<{ keys: readonly string[] }>(() => ({
  keys: readStoredKeys()
}))

function saveKeys(keys: readonly string[]): void {
  useResearchWritingEditors.setState({ keys })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // Storage can be full or disabled; ownership then lasts for this session only.
  }
}

export function claimEditorForWriting(worktreeId: string, fileId: string): void {
  const key = editorKey(worktreeId, fileId)
  const { keys } = useResearchWritingEditors.getState()
  if (!keys.includes(key)) {
    saveKeys([...keys, key].slice(-MAX_KEYS))
  }
}

export function releaseEditorToWorkbench(worktreeId: string, fileId: string): void {
  const key = editorKey(worktreeId, fileId)
  const { keys } = useResearchWritingEditors.getState()
  if (keys.includes(key)) {
    saveKeys(keys.filter((entry) => entry !== key))
  }
}

/** Editor tabs the Research Workbench leaves to Writing. */
export function researchWritingEditorTabIds(
  tabs: readonly Tab[],
  keys: readonly string[]
): string[] {
  if (keys.length === 0) {
    return []
  }
  const owned = new Set(keys)
  return tabs.flatMap((tab) =>
    tab.contentType === 'editor' && owned.has(editorKey(tab.worktreeId, tab.entityId))
      ? [tab.id]
      : []
  )
}

/** Runs Writing's open; a buffer the Workbench already shows stays a Workbench tab. */
export function openEditorForWriting(
  tabsBefore: readonly Tab[],
  worktreeId: string,
  open: () => string
): string {
  const ownedBefore = useResearchWritingEditors.getState().keys
  const fileId = open()
  const shownInWorkbench =
    !ownedBefore.includes(editorKey(worktreeId, fileId)) &&
    tabsBefore.some((tab) => tab.contentType === 'editor' && tab.entityId === fileId)
  if (!shownInWorkbench) {
    claimEditorForWriting(worktreeId, fileId)
  }
  return fileId
}

// Why: any other open (explorer, quick open, a chat link) is the user asking for a Workbench tab.
const stopReleasing = onEditorFileOpen(releaseEditorToWorkbench)
import.meta.hot?.dispose(stopReleasing)
