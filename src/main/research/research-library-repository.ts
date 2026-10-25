import {
  emptyResearchLibraryDocument,
  researchLibraryDocumentSchema
} from '../../shared/research/research-library'
import { createResearchJsonDocumentStore } from './research-json-document-store'

const libraryStore = createResearchJsonDocumentStore({
  fileName: 'library.json',
  schema: researchLibraryDocumentSchema,
  empty: emptyResearchLibraryDocument,
  label: 'Library records'
})

export const readResearchLibrary = libraryStore.read
export const saveResearchLibrary = libraryStore.save
