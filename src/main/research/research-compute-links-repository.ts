import {
  emptyResearchComputeLinksDocument,
  researchComputeLinksDocumentSchema
} from '../../shared/research/research-compute-links'
import { createResearchJsonDocumentStore } from './research-json-document-store'

const linksStore = createResearchJsonDocumentStore({
  fileName: 'compute-links.json',
  schema: researchComputeLinksDocumentSchema,
  empty: emptyResearchComputeLinksDocument,
  label: 'Compute project links'
})

export const readResearchComputeLinks = linksStore.read
export const saveResearchComputeLinks = linksStore.save
