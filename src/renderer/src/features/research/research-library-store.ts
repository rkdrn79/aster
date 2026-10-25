import { create } from 'zustand'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import type {
  LibraryPaper,
  ResearchLibraryDocument
} from '../../../../shared/research/research-library'
import { useResearchRecords } from './research-records-store'

type ResearchLibraryState = {
  document: ResearchLibraryDocument | null
  loading: boolean
  saving: boolean
  error: string | null
  load: () => Promise<void>
  update: (change: (document: ResearchLibraryDocument) => ResearchLibraryDocument) => Promise<void>
}

let loadPromise: Promise<void> | null = null
let saveQueue: Promise<void> = Promise.resolve()

/** Papers used to belong to an Experiment; each now belongs to that Experiment's workspace. */
export function libraryPapersFromLegacyRecords(records: ResearchDocument): LibraryPaper[] {
  const experiments = new Map(records.experiments.map((entry) => [entry.id, entry]))
  return (records.papers ?? []).flatMap((paper) => {
    const owner = experiments.get(paper.experimentId)
    if (!owner) {
      return []
    }
    return [
      {
        id: paper.id,
        scope: {
          hostId: owner.hostId,
          workspaceId: owner.workspaceId,
          workspacePath: owner.workspacePath
        },
        title: paper.title,
        ...(paper.authors ? { authors: paper.authors } : {}),
        ...(paper.year && paper.year >= 1000 ? { year: paper.year } : {}),
        ...(paper.doi ? { doi: paper.doi } : {}),
        ...(paper.externalUrl ? { externalUrl: paper.externalUrl } : {}),
        ...(paper.pdfPath ? { pdfPath: paper.pdfPath } : {}),
        ...(paper.notes ? { notes: paper.notes } : {}),
        tags: [],
        status: 'unread' as const,
        createdAt: paper.createdAt,
        updatedAt: paper.createdAt
      }
    ]
  })
}

async function importLegacyPapers(
  document: ResearchLibraryDocument
): Promise<ResearchLibraryDocument> {
  if (document.legacyPapersImported) {
    return document
  }
  await useResearchRecords.getState().load()
  const records = useResearchRecords.getState().document
  if (!records) {
    return document
  }
  const known = new Set(document.papers.map((paper) => paper.id))
  const imported = libraryPapersFromLegacyRecords(records).filter((paper) => !known.has(paper.id))
  try {
    return await window.api.researchLibrary.save({
      ...document,
      papers: [...document.papers, ...imported],
      legacyPapersImported: true
    })
  } catch {
    // Why: an old record that no longer validates must not lock the user out of the Library.
    return document
  }
}

export const useResearchLibrary = create<ResearchLibraryState>((set, get) => ({
  document: null,
  loading: false,
  saving: false,
  error: null,
  load: () => {
    if (get().document) {
      return Promise.resolve()
    }
    if (!window.api.researchLibrary?.read) {
      set({ error: 'Restart the app to use the Library.' })
      return Promise.resolve()
    }
    if (loadPromise) {
      return loadPromise
    }
    set({ loading: true })
    loadPromise = window.api.researchLibrary
      .read()
      .then(importLegacyPapers)
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
        throw new Error('Library records could not be loaded')
      }
      set({ saving: true, error: null })
      try {
        const saved = await window.api.researchLibrary.save(change(current))
        set({ document: saved })
      } catch (cause) {
        set({ error: `Library changes are not saved. ${String(cause)}` })
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
