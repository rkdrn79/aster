import { useSyncExternalStore } from 'react'

// Why localStorage: an unsaved plan or conclusion must survive Esc, page switches, and reloads.
const STORAGE_PREFIX = 'aster.research.notebook-draft.v1:'

export type NotebookDraftKind = 'plan' | 'conclusion'

const listeners = new Set<() => void>()

function storageKey(kind: NotebookDraftKind, experimentId: string): string {
  return `${STORAGE_PREFIX}${kind}:${experimentId}`
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readRaw(kind: NotebookDraftKind, experimentId: string): string | null {
  try {
    return localStorage.getItem(storageKey(kind, experimentId))
  } catch {
    return null
  }
}

/** The stored draft as parsed JSON, or null when there is none. */
export function readNotebookDraft(kind: NotebookDraftKind, experimentId: string): unknown {
  const raw = readRaw(kind, experimentId)
  if (raw === null) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Stores a draft, or removes it for `null`. */
export function writeNotebookDraft(
  kind: NotebookDraftKind,
  experimentId: string,
  value: unknown
): void {
  try {
    if (value === null) {
      localStorage.removeItem(storageKey(kind, experimentId))
    } else {
      localStorage.setItem(storageKey(kind, experimentId), JSON.stringify(value))
    }
  } catch {
    // Why: a full storage only means the draft does not outlive this editor.
  }
  for (const listener of listeners) {
    listener()
  }
}

/** Whether a draft is stored, re-read whenever any editor writes one. */
export function useHasNotebookDraft(kind: NotebookDraftKind, experimentId: string | null): boolean {
  const raw = useSyncExternalStore(subscribe, () =>
    experimentId ? readRaw(kind, experimentId) : null
  )
  return raw !== null
}

/**
 * Esc and Cancel close an unchanged editor and drop its draft; a changed one closes too, and its
 * draft stays for "Continue editing" or "Discard".
 */
export function closeNotebookEditor(input: {
  kind: NotebookDraftKind
  experimentId: string
  changed: boolean
  onClose: () => void
}): void {
  if (!input.changed) {
    writeNotebookDraft(input.kind, input.experimentId, null)
  }
  input.onClose()
}
