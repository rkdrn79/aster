import {
  emptyResearchGpuPolicy,
  researchGpuPolicySchema
} from '../../shared/research/research-gpu-policy'
import { createResearchJsonDocumentStore } from './research-json-document-store'

const policyStore = createResearchJsonDocumentStore({
  fileName: 'gpu-policy.json',
  schema: researchGpuPolicySchema,
  empty: emptyResearchGpuPolicy,
  label: 'GPU limits'
})

export const readResearchGpuPolicy = policyStore.read
export const saveResearchGpuPolicy = policyStore.save
