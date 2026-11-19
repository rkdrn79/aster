import { useSyncExternalStore } from 'react'
import type { ManuscriptSelection } from '@/components/editor/manuscript-selection-revision'

// The Writing source editor's current selection, per workspace, so the Writing agent pane's
// "Tighten selection" can act on it after focus has moved to the pane.

const selections = new Map<string, ManuscriptSelection>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** Records (or with null clears) the TeX selection of a workspace's Writing editor. */
export function noteWritingTexSelection(
  workspaceId: string,
  filePath: string,
  selection: ManuscriptSelection | null
): void {
  const current = selections.get(workspaceId)
  if (!selection) {
    // Why the file check: another file's editor clearing its selection must not drop this one.
    if (current && current.filePath === filePath) {
      selections.delete(workspaceId)
      notify()
    }
    return
  }
  if (
    current &&
    current.filePath === selection.filePath &&
    current.startLine === selection.startLine &&
    current.startColumn === selection.startColumn &&
    current.endLine === selection.endLine &&
    current.endColumn === selection.endColumn &&
    current.selectedText === selection.selectedText
  ) {
    return
  }
  selections.set(workspaceId, selection)
  notify()
}

export function writingTexSelection(workspaceId: string): ManuscriptSelection | null {
  return selections.get(workspaceId) ?? null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useWritingTexSelection(workspaceId: string): ManuscriptSelection | null {
  return useSyncExternalStore(
    subscribe,
    () => writingTexSelection(workspaceId),
    () => null
  )
}
