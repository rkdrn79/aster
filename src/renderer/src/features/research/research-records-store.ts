import { create } from 'zustand'
import type { ResearchDocument } from '../../../../shared/research/research-records'

type ResearchRecordsState = {
  document: ResearchDocument | null
  loading: boolean
  saving: boolean
  error: string | null
  load: () => Promise<void>
  update: (change: (document: ResearchDocument) => ResearchDocument) => Promise<void>
}

let loadPromise: Promise<void> | null = null
let saveQueue: Promise<void> = Promise.resolve()

export const useResearchRecords = create<ResearchRecordsState>((set, get) => ({
  document: null,
  loading: false,
  saving: false,
  error: null,
  load: () => {
    if (get().document) {
      return Promise.resolve()
    }
    if (!window.api.researchRecords?.read) {
      set({ error: 'Research records are unavailable in this client version.' })
      return Promise.resolve()
    }
    if (loadPromise) {
      return loadPromise
    }
    set({ loading: true })
    loadPromise = window.api.researchRecords
      .read()
      .then((document) => set({ document, error: null }))
      .catch((cause: unknown) => set({ error: String(cause) }))
      .finally(() => {
        set({ loading: false })
        loadPromise = null
      })
    return loadPromise
  },
  update: (change) => {
    const pending = saveQueue.then(async () => {
      if (!get().document) {
        await get().load()
      }
      const current = get().document
      if (!current) {
        throw new Error('Research metadata could not be loaded')
      }
      set({ saving: true, error: null })
      try {
        const saved = await window.api.researchRecords.save(change(current))
        set({ document: saved })
      } catch (cause) {
        set({ error: `Changes are not saved. ${String(cause)}` })
        throw cause
      } finally {
        set({ saving: false })
      }
    })
    saveQueue = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }
}))
