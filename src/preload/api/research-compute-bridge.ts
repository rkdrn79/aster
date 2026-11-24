import { ipcRenderer } from 'electron'
import type { ResearchComputeLinksDocument } from '../../shared/research/research-compute-links'
import type { ResearchGpuPolicy } from '../../shared/research/research-gpu-policy'
import type {
  ResearchRunHostObservation,
  ResearchRunHostQuery
} from '../../shared/research/research-run-host'
import type {
  ResearchProjectTransferPreview,
  ResearchProjectTransferRequest,
  ResearchProjectTransferResult
} from '../../shared/research/research-project-transfer'
import type {
  ResearchComputeSample,
  ResearchComputeSampleParams
} from '../../shared/research/research-compute-probe'
import type {
  ResearchSlurmActionResult,
  ResearchSlurmCancelParams,
  ResearchSlurmSubmitParams
} from '../../shared/research/research-slurm-actions'

export type ResearchComputeApi = {
  sample: (params: ResearchComputeSampleParams) => Promise<ResearchComputeSample>
  cancelJob: (params: ResearchSlurmCancelParams) => Promise<ResearchSlurmActionResult>
  submitJob: (params: ResearchSlurmSubmitParams) => Promise<ResearchSlurmActionResult>
  readLinks: () => Promise<ResearchComputeLinksDocument>
  saveLinks: (document: ResearchComputeLinksDocument) => Promise<ResearchComputeLinksDocument>
  previewTransfer: (
    request: ResearchProjectTransferRequest
  ) => Promise<ResearchProjectTransferPreview>
  transferProject: (
    request: ResearchProjectTransferRequest
  ) => Promise<ResearchProjectTransferResult>
  readGpuPolicy: () => Promise<ResearchGpuPolicy>
  saveGpuPolicy: (policy: ResearchGpuPolicy) => Promise<ResearchGpuPolicy>
  /** Which Runs this host can observe, their log state, and SLURM jobs Aster now follows. */
  observeRunHosts: (query: ResearchRunHostQuery) => Promise<ResearchRunHostObservation>
}

export const researchComputeApi: ResearchComputeApi = {
  sample: (params) => ipcRenderer.invoke('researchCompute:sample', params),
  cancelJob: (params) => ipcRenderer.invoke('researchCompute:cancelJob', params),
  submitJob: (params) => ipcRenderer.invoke('researchCompute:submitJob', params),
  readLinks: () => ipcRenderer.invoke('researchCompute:readLinks'),
  saveLinks: (document) => ipcRenderer.invoke('researchCompute:saveLinks', document),
  previewTransfer: (request) => ipcRenderer.invoke('researchCompute:previewTransfer', request),
  transferProject: (request) => ipcRenderer.invoke('researchCompute:transferProject', request),
  readGpuPolicy: () => ipcRenderer.invoke('researchCompute:readGpuPolicy'),
  saveGpuPolicy: (policy) => ipcRenderer.invoke('researchCompute:saveGpuPolicy', policy),
  observeRunHosts: (query) => ipcRenderer.invoke('researchCompute:observeRunHosts', query)
}
