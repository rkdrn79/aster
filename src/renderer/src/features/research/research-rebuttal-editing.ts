import { create } from 'zustand'

// Which reply fields hold unsaved typing, page-wide, so background work (asking the agent to
// translate) waits until the person stops editing.

type EditingState = { dirty: Readonly<Record<string, true>> }

export const useRebuttalEditing = create<EditingState>(() => ({ dirty: {} }))

// Why outside the store: it changes on every keystroke, and nothing should re-render for it.
let lastEditAt = 0

export function noteRebuttalKeystroke(now = Date.now()): void {
  lastEditAt = now
}

export function setRebuttalFieldDirty(id: string, dirty: boolean): void {
  useRebuttalEditing.setState((state) => {
    if (Boolean(state.dirty[id]) === dirty) {
      return state
    }
    const next = { ...state.dirty }
    if (dirty) {
      next[id] = true
    } else {
      delete next[id]
    }
    return { dirty: next }
  })
}

/** True when no field has unsaved typing and nothing was typed for `quietMs`. */
export function rebuttalTypingQuiet(quietMs: number, now = Date.now()): boolean {
  return (
    Object.keys(useRebuttalEditing.getState().dirty).length === 0 && now - lastEditAt >= quietMs
  )
}
