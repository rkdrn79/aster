import { create } from 'zustand'

type ResearchInlineWorkerTabs = {
  shown: ReadonlySet<string>
  show: (tabId: string) => void
}

/** Explicitly opened worker conversations can be inspected in the Workbench. */
export const useResearchInlineWorkerTabs = create<ResearchInlineWorkerTabs>((set) => ({
  shown: new Set(),
  show: (tabId) => set((state) => ({ shown: new Set([...state.shown, tabId]) }))
}))
