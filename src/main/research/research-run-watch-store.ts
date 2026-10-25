import {
  emptyResearchRunWatchDocument,
  researchRunWatchDocumentSchema
} from '../../shared/research/research-run-watch'
import { createResearchJsonDocumentStore } from './research-json-document-store'

const watchStore = createResearchJsonDocumentStore({
  fileName: 'run-watches.json',
  schema: researchRunWatchDocumentSchema,
  empty: emptyResearchRunWatchDocument,
  label: 'Research Run watches'
})

export const readResearchRunWatches = watchStore.read
export const updateResearchRunWatches = watchStore.update
