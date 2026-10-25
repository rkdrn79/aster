type EditorFileOpenListener = (worktreeId: string, fileId: string) => void

const listeners = new Set<EditorFileOpenListener>()

/** Hears every openFile/openFileForLink that lands; a surface that keeps its own views uses it. */
export function onEditorFileOpen(listener: EditorFileOpenListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyEditorFileOpen(worktreeId: string, fileId: string): void {
  for (const listener of listeners) {
    listener(worktreeId, fileId)
  }
}
