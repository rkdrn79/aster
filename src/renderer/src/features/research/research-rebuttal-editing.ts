import { create } from 'zustand'

// Which reply fields hold unsaved typing, page-wide, so background work (asking the agent to
// translate) waits until the person stops editing.

/** Field ID → the reply slot it edits ('' when it has none yet). */
type EditingState = { dirty: Readonly<Record<string, string>> }

export const useRebuttalEditing = create<EditingState>(() => ({ dirty: {} }))

// Why outside the store: it changes on every keystroke, and nothing should re-render for it.
let lastEditAt = 0

export function noteRebuttalKeystroke(now = Date.now()): void {
  lastEditAt = now
}

export function setRebuttalFieldDirty(
  id: string,
  dirty: boolean,
  slot: string | null = null
): void {
  useRebuttalEditing.setState((state) => {
    const value = slot ?? ''
    if (dirty ? state.dirty[id] === value : !(id in state.dirty)) {
      return state
    }
    const next = { ...state.dirty }
    if (dirty) {
      next[id] = value
    } else {
      delete next[id]
    }
    return { dirty: next }
  })
}

/** The reply slots that hold unsaved typing right now. */
export function rebuttalDirtySlots(): Set<string> {
  return new Set(Object.values(useRebuttalEditing.getState().dirty).filter(Boolean))
}

/** True when no field has unsaved typing and nothing was typed for `quietMs`. */
export function rebuttalTypingQuiet(quietMs: number, now = Date.now()): boolean {
  return (
    Object.keys(useRebuttalEditing.getState().dirty).length === 0 && now - lastEditAt >= quietMs
  )
}
